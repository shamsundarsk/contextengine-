import crypto from 'crypto';
import { countTokens } from '../tokenizer.js';
import { summarize } from '../summarizer.js';
import { getDatabase } from './db.js';
import {
  Branch,
  Chunk,
  Commit,
  Conflict,
  ReconstructedContext,
  SessionStats,
  SessionSummary,
  TriageLabel,
} from './types.js';

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function getAllSessions(): SessionSummary[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT session_id, COUNT(*) as commit_count, MAX(timestamp) as last_active
    FROM commits
    GROUP BY session_id
    ORDER BY last_active DESC
  `).all() as { session_id: string; commit_count: number; last_active: number }[];

  const sessionsMap = new Map<string, SessionSummary>();

  for (const r of rows) {
    const active = getActiveBranch(r.session_id);
    sessionsMap.set(r.session_id, {
      sessionId: r.session_id,
      commitCount: r.commit_count,
      lastActive: r.last_active,
      activeBranch: active.name,
    });
  }

  const branchRows = db.prepare('SELECT DISTINCT session_id FROM branches').all() as { session_id: string }[];
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

export function getBranches(sessionId: string): Branch[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT name, session_id, head_commit_id FROM branches WHERE session_id = ?').all(sessionId) as Branch[];
  if (rows.length === 0) {
    // Initialize default 'main' branch if none exists
    db.prepare('INSERT OR IGNORE INTO branches (name, session_id, head_commit_id, is_active) VALUES (?, ?, NULL, 1)').run('main', sessionId);
    return [{ name: 'main', session_id: sessionId, head_commit_id: null }];
  }
  return rows;
}

export function getActiveBranch(sessionId: string): Branch {
  const db = getDatabase();
  const activeRow = db.prepare('SELECT name, session_id, head_commit_id FROM branches WHERE session_id = ? AND is_active = 1').get(sessionId) as Branch | undefined;
  if (activeRow) return activeRow;

  const branches = getBranches(sessionId);
  return branches.find((b) => b.name === 'main') || branches[0];
}

export function getCommit(commitId: string): Commit | null {
  const db = getDatabase();
  const commitRow = db.prepare('SELECT * FROM commits WHERE id = ?').get(commitId) as any;
  if (!commitRow) return null;

  const chunksRows = db.prepare('SELECT * FROM chunks WHERE commit_id = ?').all(commitId) as Chunk[];
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

export function getCommits(sessionId: string, branchName?: string): Commit[] {
  const db = getDatabase();
  let rows: any[];
  if (branchName) {
    rows = db.prepare('SELECT * FROM commits WHERE session_id = ? AND branch = ? ORDER BY timestamp DESC').all(sessionId, branchName);
  } else {
    rows = db.prepare('SELECT * FROM commits WHERE session_id = ? ORDER BY timestamp DESC').all(sessionId);
  }

  return rows.map((r) => {
    const chunks = db.prepare('SELECT * FROM chunks WHERE commit_id = ?').all(r.id) as Chunk[];
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

export function commit(
  sessionId: string,
  branchName: string,
  topicLabel: string,
  reasonLog: string,
  chunks: { content: string; label: TriageLabel; source_ref?: string }[],
  parentId?: string
): Commit {
  const db = getDatabase();

  // Find parent ID from current branch head if not provided
  let parent = parentId ?? null;
  if (!parent) {
    const branchRow = db.prepare('SELECT head_commit_id FROM branches WHERE name = ? AND session_id = ?').get(branchName, sessionId) as any;
    if (branchRow && branchRow.head_commit_id) {
      parent = branchRow.head_commit_id;
    }
  }

  const commitId = generateId('commit');
  const timestamp = Date.now();

  const insertCommitStmt = db.prepare(`
    INSERT INTO commits (id, parent_id, session_id, branch, timestamp, topic_label, reason_log)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertChunkStmt = db.prepare(`
    INSERT INTO chunks (id, commit_id, content, label, source_ref)
    VALUES (?, ?, ?, ?, ?)
  `);

  const updateBranchStmt = db.prepare(`
    INSERT INTO branches (name, session_id, head_commit_id)
    VALUES (?, ?, ?)
    ON CONFLICT(name, session_id) DO UPDATE SET head_commit_id = excluded.head_commit_id
  `);

  const createdChunks: Chunk[] = [];

  const transaction = db.transaction(() => {
    insertCommitStmt.run(commitId, parent, sessionId, branchName, timestamp, topicLabel, reasonLog);

    for (const c of chunks) {
      const chunkId = generateId('chunk');
      insertChunkStmt.run(chunkId, commitId, c.content, c.label, c.source_ref || null);
      createdChunks.push({
        id: chunkId,
        commit_id: commitId,
        content: c.content,
        label: c.label,
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
    chunks: createdChunks,
  };
}

export function branch(sessionId: string, name: string, fromCommitId?: string): Branch {
  const db = getDatabase();

  // Check if branch already exists
  const existingBranch = db
    .prepare('SELECT name, session_id, head_commit_id FROM branches WHERE session_id = ? AND name = ?')
    .get(sessionId, name) as Branch | undefined;

  if (existingBranch) {
    // Branch already exists — just switch to it, preserve its existing head_commit_id
    db.transaction(() => {
      db.prepare('UPDATE branches SET is_active = 0 WHERE session_id = ?').run(sessionId);
      db.prepare('UPDATE branches SET is_active = 1 WHERE session_id = ? AND name = ?').run(sessionId, name);
    })();

    return existingBranch;
  }

  // New branch — inherit head from fromCommitId or current active branch
  let headId: string | null = fromCommitId || null;
  if (!headId) {
    const active = getActiveBranch(sessionId);
    headId = active.head_commit_id;
  }

  db.transaction(() => {
    db.prepare('UPDATE branches SET is_active = 0 WHERE session_id = ?').run(sessionId);
    db.prepare(
      'INSERT INTO branches (name, session_id, head_commit_id, is_active) VALUES (?, ?, ?, 1)'
    ).run(name, sessionId, headId);
  })();

  return {
    name,
    session_id: sessionId,
    head_commit_id: headId,
  };
}

export function checkout(sessionId: string, commitId: string): void {
  const db = getDatabase();
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

export function merge(
  sessionId: string,
  sourceBranchName: string,
  targetBranchName: string = 'main'
): { success: boolean; conflict?: Conflict; mergedCommitId?: string } {
  const db = getDatabase();

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

      if (
        sCommit &&
        tCommit &&
        sCommit.topic_label === tCommit.topic_label &&
        sChunk.content.trim() !== tChunk.content.trim()
      ) {
        // Conflict detected! Write to conflicts table and do not auto-resolve
        const conflictId = generateId('conflict');
        const desc = `Conflicting kept_verbatim facts under topic '${sCommit.topic_label}': "${sChunk.content.slice(
          0,
          50
        )}..." vs "${tChunk.content.slice(0, 50)}..."`;

        db.prepare(`
          INSERT INTO conflicts (id, session_id, branch_a, branch_b, topic_label, description, resolved, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?)
        `).run(conflictId, sessionId, targetBranchName, sourceBranchName, sCommit.topic_label, desc, Date.now());

        const conflictObj: Conflict = {
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

  const mergeCommit = commit(
    sessionId,
    targetBranchName,
    `Merge branch '${sourceBranchName}' into '${targetBranchName}'`,
    `Successfully merged ${sourceKeptChunks.length} kept verbatim facts from ${sourceBranchName}`,
    newChunks,
    targetHead || undefined
  );

  return { success: true, mergedCommitId: mergeCommit.id };
}

export function getConflicts(sessionId?: string): Conflict[] {
  const db = getDatabase();
  let rows: any[];
  if (sessionId) {
    rows = db.prepare('SELECT * FROM conflicts WHERE session_id = ? ORDER BY timestamp DESC').all(sessionId);
  } else {
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

export function resolveConflict(conflictId: string): void {
  const db = getDatabase();
  db.prepare('UPDATE conflicts SET resolved = 1 WHERE id = ?').run(conflictId);
}

export function promoteChunk(chunkId: string, newLabel: TriageLabel, overrideBy: string = 'user'): Commit {
  const db = getDatabase();

  const targetChunk = db.prepare('SELECT * FROM chunks WHERE id = ?').get(chunkId) as Chunk | undefined;
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
  const overrideCommit = commit(
    sessionId,
    activeBranch.name,
    `Override [${origCommit.topic_label}]`,
    reason,
    newChunks,
    headCommit?.id || undefined
  );

  return overrideCommit;
}

export async function reconstructContext(sessionId: string): Promise<ReconstructedContext> {
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
  const db = getDatabase();
  const historyCommits: Commit[] = [];
  let currId: string | null = headCommitId;

  while (currId) {
    const c = getCommit(currId);
    if (!c) break;
    historyCommits.push(c);
    currId = c.parent_id;
  }

  // Chronological order (oldest to newest)
  historyCommits.reverse();

  const allChunks = historyCommits.flatMap((c) => c.chunks || []);

  const keptVerbatim = allChunks.filter((c) => c.label === 'keep_verbatim');
  const summarizeChunks = allChunks.filter((c) => c.label === 'summarize');

  let rollingSummary = '';
  if (summarizeChunks.length > 0) {
    rollingSummary = await summarize(summarizeChunks);
  }

  const keptText = keptVerbatim.map((c) => c.content).join('\n\n');
  const fullPromptText = [
    rollingSummary ? `=== CONTEXT SUMMARY ===\n${rollingSummary}` : '',
    keptText ? `=== RELEVANT CONTEXT ===\n${keptText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const rawText = allChunks.map((c) => c.content).join('\n\n');
  const rawTokenCount = countTokens(rawText);
  const reconstructedTokenCount = countTokens(fullPromptText);

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

export function getStats(sessionId: string): SessionStats {
  const db = getDatabase();
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
      const tokens = countTokens(chunk.content);
      totalOriginalTokens += tokens;

      if (chunk.label === 'keep_verbatim') {
        keptVerbatimCount++;
        totalOptimizedTokens += tokens;
      } else if (chunk.label === 'summarize') {
        summarizedCount++;
        totalOptimizedTokens += Math.ceil(tokens * 0.2); // ~80% compression estimate
      } else {
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
