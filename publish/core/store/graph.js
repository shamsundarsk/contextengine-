"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllSessions = getAllSessions;
exports.getBranches = getBranches;
exports.getActiveBranch = getActiveBranch;
exports.getCommit = getCommit;
exports.getCommits = getCommits;
exports.commit = commit;
exports.pruneTransientLogs = pruneTransientLogs;
exports.overrideMemoryNode = overrideMemoryNode;
exports.getContextTree = getContextTree;
exports.branch = branch;
exports.checkout = checkout;
exports.merge = merge;
exports.getConflicts = getConflicts;
exports.resolveConflict = resolveConflict;
exports.promoteChunk = promoteChunk;
exports.reconstructContext = reconstructContext;
exports.getStats = getStats;
const crypto_1 = __importDefault(require("crypto"));
const tokenizer_js_1 = require("../tokenizer.js");
const summarizer_js_1 = require("../summarizer.js");
const db_js_1 = require("./db.js");
function generateId(prefix) {
    return `${prefix}_${crypto_1.default.randomBytes(8).toString('hex')}`;
}
function getAllSessions() {
    const db = (0, db_js_1.getDatabase)();
    const rows = db.prepare(`
    SELECT session_id, COUNT(*) as commit_count, MAX(timestamp) as last_active
    FROM commits
    GROUP BY session_id
    ORDER BY last_active DESC
  `).all();
    const sessionsMap = new Map();
    for (const r of rows) {
        const active = getActiveBranch(r.session_id);
        sessionsMap.set(r.session_id, {
            sessionId: r.session_id,
            commitCount: r.commit_count,
            lastActive: r.last_active,
            activeBranch: active.name,
        });
    }
    const branchRows = db.prepare('SELECT DISTINCT session_id FROM branches').all();
    for (const b of branchRows) {
        if (!sessionsMap.has(b.session_id)) {
            sessionsMap.set(b.session_id, {
                sessionId: b.session_id,
                commitCount: 0,
                lastActive: Date.now(),
                activeBranch: 'main',
            });
        }
    }
    if (sessionsMap.size === 0) {
        return [{ sessionId: 'default_session', commitCount: 0, lastActive: Date.now(), activeBranch: 'main' }];
    }
    return Array.from(sessionsMap.values());
}
function getBranches(sessionId) {
    const db = (0, db_js_1.getDatabase)();
    const rows = db.prepare('SELECT name, session_id, head_commit_id FROM branches WHERE session_id = ?').all(sessionId);
    if (rows.length === 0) {
        // Initialize default 'main' branch if none exists
        db.prepare('INSERT OR IGNORE INTO branches (name, session_id, head_commit_id, is_active) VALUES (?, ?, NULL, 1)').run('main', sessionId);
        return [{ name: 'main', session_id: sessionId, head_commit_id: null }];
    }
    return rows;
}
function getActiveBranch(sessionId) {
    const db = (0, db_js_1.getDatabase)();
    const activeRow = db.prepare('SELECT name, session_id, head_commit_id FROM branches WHERE session_id = ? AND is_active = 1').get(sessionId);
    if (activeRow)
        return activeRow;
    const branches = getBranches(sessionId);
    return branches.find((b) => b.name === 'main') || branches[0];
}
function getCommit(commitId) {
    const db = (0, db_js_1.getDatabase)();
    const commitRow = db.prepare('SELECT * FROM commits WHERE id = ?').get(commitId);
    if (!commitRow)
        return null;
    const chunksRows = db.prepare('SELECT * FROM chunks WHERE commit_id = ?').all(commitId);
    return {
        id: commitRow.id,
        parent_id: commitRow.parent_id,
        session_id: commitRow.session_id,
        branch: commitRow.branch,
        timestamp: commitRow.timestamp,
        topic_label: commitRow.topic_label,
        reason_log: commitRow.reason_log,
        chunks: chunksRows,
    };
}
function getCommits(sessionId, branchName) {
    const db = (0, db_js_1.getDatabase)();
    let rows;
    if (branchName) {
        rows = db.prepare('SELECT * FROM commits WHERE session_id = ? AND branch = ? ORDER BY timestamp DESC').all(sessionId, branchName);
    }
    else {
        rows = db.prepare('SELECT * FROM commits WHERE session_id = ? ORDER BY timestamp DESC').all(sessionId);
    }
    return rows.map((r) => {
        const chunks = db.prepare('SELECT * FROM chunks WHERE commit_id = ?').all(r.id);
        return {
            id: r.id,
            parent_id: r.parent_id,
            session_id: r.session_id,
            branch: r.branch,
            timestamp: r.timestamp,
            topic_label: r.topic_label,
            reason_log: r.reason_log,
            chunks,
        };
    });
}
function commit(sessionId, branchName, topicLabel, reasonLog, chunks, parentId, turn) {
    const db = (0, db_js_1.getDatabase)();
    // Find parent ID from current branch head if not provided
    let parent = parentId ?? null;
    if (!parent) {
        const branchRow = db.prepare('SELECT head_commit_id FROM branches WHERE name = ? AND session_id = ?').get(branchName, sessionId);
        if (branchRow && branchRow.head_commit_id) {
            parent = branchRow.head_commit_id;
        }
    }
    const commitId = generateId('commit');
    const timestamp = Date.now();
    const commitTurn = turn ?? 0;
    const insertCommitStmt = db.prepare(`
    INSERT INTO commits (id, parent_id, session_id, branch, timestamp, topic_label, reason_log, turn)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const insertChunkStmt = db.prepare(`
    INSERT INTO chunks (id, commit_id, content, label, tier, turn, created_at, source_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const updateBranchStmt = db.prepare(`
    INSERT INTO branches (name, session_id, head_commit_id)
    VALUES (?, ?, ?)
    ON CONFLICT(name, session_id) DO UPDATE SET head_commit_id = excluded.head_commit_id
  `);
    const createdChunks = [];
    const transaction = db.transaction(() => {
        insertCommitStmt.run(commitId, parent, sessionId, branchName, timestamp, topicLabel, reasonLog, commitTurn);
        for (const c of chunks) {
            const chunkId = generateId('chunk');
            const tier = c.tier || (c.label === 'keep_verbatim' ? 'architectural' : 'conversational');
            const chunkTurn = c.turn ?? commitTurn;
            const createdAt = timestamp;
            insertChunkStmt.run(chunkId, commitId, c.content, c.label, tier, chunkTurn, createdAt, c.source_ref || null);
            createdChunks.push({
                id: chunkId,
                commit_id: commitId,
                content: c.content,
                label: c.label,
                tier,
                turn: chunkTurn,
                created_at: createdAt,
                source_ref: c.source_ref,
            });
        }
        updateBranchStmt.run(branchName, sessionId, commitId);
    });
    transaction();
    return {
        id: commitId,
        parent_id: parent,
        session_id: sessionId,
        branch: branchName,
        timestamp,
        topic_label: topicLabel,
        reason_log: reasonLog,
        turn: commitTurn,
        chunks: createdChunks,
    };
}
/**
 * Prunes transient logs older than maxTurnsToKeep (default: 3 turns) to prevent filler accumulation.
 */
function pruneTransientLogs(sessionId, currentTurn, maxTurnsToKeep = 3) {
    const db = (0, db_js_1.getDatabase)();
    let prunedCount = 0;
    db.transaction(() => {
        if (typeof currentTurn === 'number') {
            const minKeepTurn = currentTurn - maxTurnsToKeep;
            const res = db.prepare(`
        DELETE FROM chunks
        WHERE commit_id IN (SELECT id FROM commits WHERE session_id = ?)
          AND tier = 'transient'
          AND turn <= ?
      `).run(sessionId, minKeepTurn);
            prunedCount += res.changes;
        }
        else {
            const recentCommitRows = db.prepare(`
        SELECT id FROM commits WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
      `).all(sessionId, maxTurnsToKeep);
            const recentIds = recentCommitRows.map((r) => r.id);
            if (recentIds.length > 0) {
                const placeholders = recentIds.map(() => '?').join(',');
                const res = db.prepare(`
          DELETE FROM chunks
          WHERE commit_id IN (SELECT id FROM commits WHERE session_id = ?)
            AND tier = 'transient'
            AND commit_id NOT IN (${placeholders})
        `).run(sessionId, ...recentIds);
                prunedCount += res.changes;
            }
        }
    })();
    return prunedCount;
}
/**
 * Forcibly targets an exact commit node in the history graph and updates its text content / prunes debug junk.
 */
function overrideMemoryNode(commitId, options) {
    const db = (0, db_js_1.getDatabase)();
    const existingCommit = getCommit(commitId);
    if (!existingCommit) {
        throw new Error(`Commit ${commitId} not found.`);
    }
    const newTopic = options.new_topic?.trim() || existingCommit.topic_label;
    const newReason = options.new_summary?.trim() || existingCommit.reason_log;
    db.transaction(() => {
        // 1. Direct update to commit node
        db.prepare(`
      UPDATE commits
      SET topic_label = ?, reason_log = ?
      WHERE id = ?
    `).run(newTopic, newReason, commitId);
        // 2. Prune transient logs if requested
        if (options.prune_transient) {
            db.prepare(`
        DELETE FROM chunks
        WHERE commit_id = ? AND (tier = 'transient' OR label = 'discard')
      `).run(commitId);
        }
        // 3. Delete specific chunk IDs if requested
        if (options.discard_chunk_ids && options.discard_chunk_ids.length > 0) {
            const placeholders = options.discard_chunk_ids.map(() => '?').join(',');
            db.prepare(`
        DELETE FROM chunks
        WHERE commit_id = ? AND id IN (${placeholders})
      `).run(commitId, ...options.discard_chunk_ids);
        }
        // 4. Overwrite kept chunks if new facts provided
        if (options.kept_chunks && options.kept_chunks.length > 0) {
            db.prepare(`DELETE FROM chunks WHERE commit_id = ?`).run(commitId);
            const insertChunkStmt = db.prepare(`
        INSERT INTO chunks (id, commit_id, content, label, tier, turn, created_at, source_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
            for (const fact of options.kept_chunks) {
                const chunkId = generateId('chunk');
                insertChunkStmt.run(chunkId, commitId, fact, 'keep_verbatim', 'architectural', existingCommit.turn || 0, Date.now(), 'user_override');
            }
        }
    })();
    const updatedCommit = getCommit(commitId);
    if (!updatedCommit) {
        throw new Error(`Failed to retrieve updated commit ${commitId}`);
    }
    return updatedCommit;
}
/**
 * Builds a clean, visual markdown text graph tree of branches, commits, and memory states straight to the chat view.
 */
function getContextTree(sessionId = 'default_session') {
    const db = (0, db_js_1.getDatabase)();
    let targetSession = sessionId;
    const allSessions = getAllSessions();
    // If default session has no commits, pick first active session with commits as convenience
    const currentSessionCommits = getCommits(targetSession);
    if (currentSessionCommits.length === 0 && sessionId === 'default_session') {
        const activeWithCommits = allSessions.find((s) => s.commitCount > 0);
        if (activeWithCommits) {
            targetSession = activeWithCommits.sessionId;
        }
    }
    const branches = getBranches(targetSession);
    const activeBranch = getActiveBranch(targetSession);
    const stats = getStats(targetSession);
    const commits = getCommits(targetSession);
    if (commits.length === 0) {
        return [
            `# 🌳 Context Memory Graph Tree`,
            `**Session**: \`${targetSession}\` | **Active Branch**: \`${activeBranch.name}\` (HEAD: none)`,
            ``,
            `*No commits recorded in memory graph yet.*`,
            ``,
            `Memory is initialized and waiting for conversational milestones or background auto-commits.`,
        ].join('\n');
    }
    const branchTrees = [];
    for (const b of branches) {
        const branchCommits = getCommits(targetSession, b.name);
        const isActive = b.name === activeBranch.name;
        const headerPrefix = isActive ? `* **[${b.name}]** (ACTIVE HEAD -> \`${b.head_commit_id || 'root'}\`)` : `* **[${b.name}]** (HEAD -> \`${b.head_commit_id || 'root'}\`)`;
        if (branchCommits.length === 0) {
            branchTrees.push(`${headerPrefix}\n  └── (no commits on this branch)`);
            continue;
        }
        const lines = [headerPrefix];
        branchCommits.forEach((c, idx) => {
            const isLast = idx === branchCommits.length - 1;
            const connector = isLast ? '└──' : '├──';
            const subConnector = isLast ? '    ' : '│   ';
            const dateStr = new Date(c.timestamp).toLocaleTimeString();
            const keptCount = (c.chunks || []).filter((ch) => ch.label === 'keep_verbatim').length;
            const transientCount = (c.chunks || []).filter((ch) => ch.tier === 'transient').length;
            lines.push(`  ${connector} [\`${c.id.slice(0, 12)}\`] ${dateStr} - **${c.topic_label}**`);
            lines.push(`  ${subConnector} ↳ Summary: "${c.reason_log.slice(0, 70)}${c.reason_log.length > 70 ? '...' : ''}"`);
            lines.push(`  ${subConnector} ↳ Facts: ${keptCount} kept verbatim · ${transientCount} transient`);
        });
        branchTrees.push(lines.join('\n'));
    }
    return [
        `# 🌳 Context Memory Graph Tree`,
        `**Session**: \`${targetSession}\` | **Active Branch**: \`${activeBranch.name}\` | **HEAD**: \`${activeBranch.head_commit_id || 'none'}\``,
        ``,
        `### Branch Topology & Commits:`,
        branchTrees.join('\n\n'),
        ``,
        `### Memory State Summary:`,
        `- **Total Commits**: ${stats.totalCommits}`,
        `- **Active Branches**: ${branches.length}`,
        `- **Preserved Architectural Facts**: ${stats.keptVerbatimCount}`,
        `- **Summarized Context Chunks**: ${stats.summarizedCount}`,
        `- **Discarded Filler Items**: ${stats.discardedCount}`,
        `- **Estimated Token Savings**: ${stats.tokensSavedPct}% (~${Math.max(0, stats.totalOriginalTokens - stats.totalOptimizedTokens)} tokens)`,
    ].join('\n');
}
function branch(sessionId, name, fromCommitId) {
    const db = (0, db_js_1.getDatabase)();
    // Check if branch already exists
    const existingBranch = db
        .prepare('SELECT name, session_id, head_commit_id FROM branches WHERE session_id = ? AND name = ?')
        .get(sessionId, name);
    if (existingBranch) {
        // Branch already exists — just switch to it, preserve its existing head_commit_id
        db.transaction(() => {
            db.prepare('UPDATE branches SET is_active = 0 WHERE session_id = ?').run(sessionId);
            db.prepare('UPDATE branches SET is_active = 1 WHERE session_id = ? AND name = ?').run(sessionId, name);
        })();
        return existingBranch;
    }
    // New branch — inherit head from fromCommitId or current active branch
    let headId = fromCommitId || null;
    if (!headId) {
        const active = getActiveBranch(sessionId);
        headId = active.head_commit_id;
    }
    db.transaction(() => {
        db.prepare('UPDATE branches SET is_active = 0 WHERE session_id = ?').run(sessionId);
        db.prepare('INSERT INTO branches (name, session_id, head_commit_id, is_active) VALUES (?, ?, ?, 1)').run(name, sessionId, headId);
    })();
    return {
        name,
        session_id: sessionId,
        head_commit_id: headId,
    };
}
function checkout(sessionId, commitId) {
    const db = (0, db_js_1.getDatabase)();
    const targetCommit = getCommit(commitId);
    if (!targetCommit) {
        throw new Error(`Commit ${commitId} not found.`);
    }
    db.transaction(() => {
        db.prepare('UPDATE branches SET is_active = 0 WHERE session_id = ?').run(sessionId);
        db.prepare(`
      INSERT INTO branches (name, session_id, head_commit_id, is_active)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(name, session_id) DO UPDATE SET head_commit_id = excluded.head_commit_id, is_active = 1
    `).run(targetCommit.branch, sessionId, commitId);
    })();
}
function merge(sessionId, sourceBranchName, targetBranchName = 'main') {
    const db = (0, db_js_1.getDatabase)();
    const sourceCommits = getCommits(sessionId, sourceBranchName);
    const targetCommits = getCommits(sessionId, targetBranchName);
    if (sourceCommits.length === 0) {
        throw new Error(`Source branch ${sourceBranchName} has no commits.`);
    }
    // Detect conflicts: matching kept_verbatim chunks with same topic label but different content
    const sourceKeptChunks = sourceCommits.flatMap((c) => (c.chunks || []).filter((ch) => ch.label === 'keep_verbatim'));
    const targetKeptChunks = targetCommits.flatMap((c) => (c.chunks || []).filter((ch) => ch.label === 'keep_verbatim'));
    for (const sChunk of sourceKeptChunks) {
        for (const tChunk of targetKeptChunks) {
            const sCommit = sourceCommits.find((c) => c.id === sChunk.commit_id);
            const tCommit = targetCommits.find((c) => c.id === tChunk.commit_id);
            if (sCommit &&
                tCommit &&
                sCommit.topic_label === tCommit.topic_label &&
                sChunk.content.trim() !== tChunk.content.trim()) {
                // Conflict detected! Write to conflicts table and do not auto-resolve
                const conflictId = generateId('conflict');
                const desc = `Conflicting kept_verbatim facts under topic '${sCommit.topic_label}': "${sChunk.content.slice(0, 50)}..." vs "${tChunk.content.slice(0, 50)}..."`;
                db.prepare(`
          INSERT INTO conflicts (id, session_id, branch_a, branch_b, topic_label, description, resolved, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?)
        `).run(conflictId, sessionId, targetBranchName, sourceBranchName, sCommit.topic_label, desc, Date.now());
                const conflictObj = {
                    id: conflictId,
                    session_id: sessionId,
                    branch_a: targetBranchName,
                    branch_b: sourceBranchName,
                    topic_label: sCommit.topic_label,
                    description: desc,
                    resolved: false,
                    timestamp: Date.now(),
                };
                return { success: false, conflict: conflictObj };
            }
        }
    }
    // No conflict! Perform merge commit into target branch
    const targetHead = targetCommits[0]?.id || null;
    const newChunks = sourceKeptChunks.map((ch) => ({
        content: ch.content,
        label: ch.label,
        source_ref: `merged from ${sourceBranchName}`,
    }));
    const mergeCommit = commit(sessionId, targetBranchName, `Merge branch '${sourceBranchName}' into '${targetBranchName}'`, `Successfully merged ${sourceKeptChunks.length} kept verbatim facts from ${sourceBranchName}`, newChunks, targetHead || undefined);
    return { success: true, mergedCommitId: mergeCommit.id };
}
function getConflicts(sessionId) {
    const db = (0, db_js_1.getDatabase)();
    let rows;
    if (sessionId) {
        rows = db.prepare('SELECT * FROM conflicts WHERE session_id = ? ORDER BY timestamp DESC').all(sessionId);
    }
    else {
        rows = db.prepare('SELECT * FROM conflicts ORDER BY timestamp DESC').all();
    }
    return rows.map((r) => ({
        id: r.id,
        session_id: r.session_id,
        branch_a: r.branch_a,
        branch_b: r.branch_b,
        topic_label: r.topic_label,
        description: r.description,
        resolved: Boolean(r.resolved),
        timestamp: r.timestamp,
    }));
}
function resolveConflict(conflictId) {
    const db = (0, db_js_1.getDatabase)();
    db.prepare('UPDATE conflicts SET resolved = 1 WHERE id = ?').run(conflictId);
}
function promoteChunk(chunkId, newLabel, overrideBy = 'user') {
    const db = (0, db_js_1.getDatabase)();
    const targetChunk = db.prepare('SELECT * FROM chunks WHERE id = ?').get(chunkId);
    if (!targetChunk) {
        throw new Error(`Chunk ${chunkId} not found.`);
    }
    const origCommit = getCommit(targetChunk.commit_id);
    if (!origCommit) {
        throw new Error(`Commit ${targetChunk.commit_id} not found.`);
    }
    const sessionId = origCommit.session_id;
    const activeBranch = getActiveBranch(sessionId);
    const headCommit = activeBranch.head_commit_id ? getCommit(activeBranch.head_commit_id) : null;
    // Build new state copying existing chunks with the override applied
    const currentChunks = headCommit?.chunks || origCommit.chunks || [];
    const newChunks = currentChunks.map((ch) => ({
        content: ch.content,
        label: ch.id === chunkId ? newLabel : ch.label,
        source_ref: ch.id === chunkId ? `override_${newLabel}_from_${ch.id}` : ch.source_ref,
    }));
    const reason = `manual override: promoted chunk ${chunkId} to ${newLabel} by ${overrideBy}`;
    const overrideCommit = commit(sessionId, activeBranch.name, `Override [${origCommit.topic_label}]`, reason, newChunks, headCommit?.id || undefined);
    return overrideCommit;
}
async function reconstructContext(sessionId) {
    const activeBranch = getActiveBranch(sessionId);
    const headCommitId = activeBranch.head_commit_id;
    if (!headCommitId) {
        return {
            keptVerbatim: [],
            summaries: [],
            fullPromptText: '',
            rawTokenCount: 0,
            reconstructedTokenCount: 0,
            tokensSavedPct: 0,
            activeBranch: activeBranch.name,
            headCommitId: null,
        };
    }
    // Walk ancestry chain from head commit
    const db = (0, db_js_1.getDatabase)();
    const historyCommits = [];
    let currId = headCommitId;
    while (currId) {
        const c = getCommit(currId);
        if (!c)
            break;
        historyCommits.push(c);
        currId = c.parent_id;
    }
    // Prune transient logs older than 3 commits before reconstructing
    try {
        pruneTransientLogs(sessionId);
    }
    catch {
        // Non-fatal
    }
    // Chronological order (oldest to newest)
    historyCommits.reverse();
    const allChunks = historyCommits.flatMap((c) => c.chunks || []);
    const keptVerbatim = allChunks.filter((c) => c.label === 'keep_verbatim' && c.tier !== 'transient');
    const summarizeChunks = allChunks.filter((c) => c.label === 'summarize' && c.tier !== 'transient');
    let rollingSummary = '';
    if (summarizeChunks.length > 0) {
        rollingSummary = await (0, summarizer_js_1.summarize)(summarizeChunks);
    }
    const keptText = keptVerbatim.map((c) => c.content).join('\n\n');
    const fullPromptText = [
        rollingSummary ? `=== CONTEXT SUMMARY ===\n${rollingSummary}` : '',
        keptText ? `=== RELEVANT CONTEXT ===\n${keptText}` : '',
    ]
        .filter(Boolean)
        .join('\n\n');
    const rawText = allChunks.map((c) => c.content).join('\n\n');
    const rawTokenCount = (0, tokenizer_js_1.countTokens)(rawText);
    const reconstructedTokenCount = (0, tokenizer_js_1.countTokens)(fullPromptText);
    let tokensSavedPct = 0;
    if (rawTokenCount > 0) {
        tokensSavedPct = Math.max(0, Math.round(((rawTokenCount - reconstructedTokenCount) / rawTokenCount) * 100));
    }
    return {
        keptVerbatim,
        summaries: rollingSummary ? [rollingSummary] : [],
        fullPromptText,
        rawTokenCount,
        reconstructedTokenCount,
        tokensSavedPct,
        activeBranch: activeBranch.name,
        headCommitId,
    };
}
function getStats(sessionId) {
    const db = (0, db_js_1.getDatabase)();
    const commits = getCommits(sessionId);
    const activeBranch = getActiveBranch(sessionId);
    const conflicts = getConflicts(sessionId).filter((c) => !c.resolved);
    let keptVerbatimCount = 0;
    let summarizedCount = 0;
    let discardedCount = 0;
    let totalOriginalTokens = 0;
    let totalOptimizedTokens = 0;
    for (const c of commits) {
        for (const chunk of c.chunks || []) {
            const tokens = (0, tokenizer_js_1.countTokens)(chunk.content);
            totalOriginalTokens += tokens;
            if (chunk.label === 'keep_verbatim') {
                keptVerbatimCount++;
                totalOptimizedTokens += tokens;
            }
            else if (chunk.label === 'summarize') {
                summarizedCount++;
                totalOptimizedTokens += Math.ceil(tokens * 0.2); // ~80% compression estimate
            }
            else {
                discardedCount++;
            }
        }
    }
    let tokensSavedPct = 0;
    if (totalOriginalTokens > 0) {
        tokensSavedPct = Math.max(0, Math.round(((totalOriginalTokens - totalOptimizedTokens) / totalOriginalTokens) * 100));
    }
    // Cost calculation estimate ($0.003 per 1K tokens saved)
    const tokensSaved = Math.max(0, totalOriginalTokens - totalOptimizedTokens);
    const estimatedCostSavedUSD = Number(((tokensSaved / 1000) * 0.003).toFixed(4));
    return {
        sessionId,
        totalCommits: commits.length,
        activeBranch: activeBranch.name,
        totalOriginalTokens,
        totalOptimizedTokens,
        tokensSavedPct,
        estimatedCostSavedUSD,
        keptVerbatimCount,
        summarizedCount,
        discardedCount,
        conflictCount: conflicts.length,
    };
}
//# sourceMappingURL=graph.js.map