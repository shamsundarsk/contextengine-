import {
  commit as coreCommit,
  branch as coreBranch,
  checkout as coreCheckout,
  merge as coreMerge,
  getCommits,
  getBranches,
  getActiveBranch,
  getAllSessions,
  reconstructContext,
  computeEmbedding,
  cosineSimilarity,
  getContextTree,
  overrideMemoryNode,
  classifyTextTier,
  scoreChunk,
  pruneTransientLogs,
  OverrideNodeOptions,
  TriageLabel,
  LogTier,
} from '@context-engine/core';

// Internal session turn tracking and buffered messages for autonomous commits
interface SessionTurnState {
  turnCount: number;
  buffer: { role: string; content: string; timestamp: number }[];
  lastWorkspaceDir?: string;
}

const sessionStates = new Map<string, SessionTurnState>();

function getSessionState(sessionId: string): SessionTurnState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = { turnCount: 0, buffer: [] };
    sessionStates.set(sessionId, state);
  }
  return state;
}

export function getTurnCount(sessionId: string): number {
  return getSessionState(sessionId).turnCount;
}

export function resetTurnCount(sessionId: string): void {
  const state = getSessionState(sessionId);
  state.turnCount = 0;
  state.buffer = [];
}

/**
 * Auto-branching: Detects workspace directory changes or project shifts and cleanly spawns
 * isolated memory branches behind the scenes without user intervention.
 */
export function autoBranchOnContextShift(
  sessionId: string,
  workspacePath?: string
): { branched: boolean; branchName: string; reason: string } {
  if (!workspacePath || !workspacePath.trim()) {
    const active = getActiveBranch(sessionId);
    return { branched: false, branchName: active.name, reason: 'No workspace path provided.' };
  }

  const state = getSessionState(sessionId);
  const normalizedPath = workspacePath.trim().replace(/\\/g, '/');

  // Detect project shift
  if (state.lastWorkspaceDir && state.lastWorkspaceDir === normalizedPath) {
    const active = getActiveBranch(sessionId);
    return { branched: false, branchName: active.name, reason: 'Workspace unchanged.' };
  }

  state.lastWorkspaceDir = normalizedPath;
  const parts = normalizedPath.split('/').filter(Boolean);
  const leafDir = parts[parts.length - 1] || 'subproject';
  const sanitizedDirName = leafDir.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const targetBranchName = `auto-branch-${sanitizedDirName}`;

  const branches = getBranches(sessionId);
  const activeBranch = getActiveBranch(sessionId);

  if (activeBranch.name === targetBranchName) {
    return { branched: false, branchName: activeBranch.name, reason: 'Already on target branch.' };
  }

  const existing = branches.find((b) => b.name === targetBranchName);
  coreBranch(sessionId, targetBranchName);

  return {
    branched: true,
    branchName: targetBranchName,
    reason: existing
      ? `Switched to branch '${targetBranchName}' due to workspace shift to '${leafDir}'.`
      : `Spawned isolated branch '${targetBranchName}' for workspace '${leafDir}'.`,
  };
}

/**
 * Auto-committing: Records conversational turns and every 5-10 turns executes background triage
 * and commits compressed state to SQLite atomically.
 */
export async function recordTurnAndAutoCommit(
  sessionId: string,
  turnContent: string,
  role: string = 'user'
): Promise<{ committed: boolean; commitId?: string; turnCount: number }> {
  const state = getSessionState(sessionId);
  state.turnCount += 1;
  state.buffer.push({ role, content: turnContent, timestamp: Date.now() });

  // Trigger auto-commit every 5 turns (between 5 and 10 conversational turns)
  if (state.turnCount % 5 === 0 && state.buffer.length > 0) {
    try {
      const activeBranch = getActiveBranch(sessionId);
      const combinedContext = state.buffer.map((b) => `${b.role.toUpperCase()}: ${b.content}`).join('\n');

      const triagedChunks: { content: string; label: TriageLabel; tier?: LogTier; turn?: number; source_ref?: string }[] = [];

      for (let i = 0; i < state.buffer.length; i++) {
        const item = state.buffer[i];
        const recency = (i + 1) / state.buffer.length;
        const scoreRes = await scoreChunk(item.content, {
          recencyNormalized: recency,
          contextText: combinedContext,
          turnAge: state.turnCount,
        });

        // Prune transient logs from verbatim retention; keep architectural or summarize
        triagedChunks.push({
          content: `[${item.role.toUpperCase()}]: ${item.content}`,
          label: scoreRes.label,
          tier: scoreRes.tier,
          turn: state.turnCount,
          source_ref: `auto_turn_${state.turnCount}_msg_${i}`,
        });
      }

      // Automatically prune transient logs older than 3 turns
      pruneTransientLogs(sessionId, state.turnCount, 3);

      const lastUser = [...state.buffer].reverse().find((b) => b.role === 'user') || state.buffer[state.buffer.length - 1];
      const topic = `[Auto-Milestone] Turn ${state.turnCount}: ${lastUser.content.slice(0, 45).replace(/[\r\n]+/g, ' ')}`;
      const summary = `Autonomous background commit after turn ${state.turnCount}. Triaged ${state.buffer.length} turns into compressed state.`;

      const newCommit = coreCommit(sessionId, activeBranch.name, topic, summary, triagedChunks, undefined, state.turnCount);

      // Clear processed buffer
      state.buffer = [];

      return {
        committed: true,
        commitId: newCommit.id,
        turnCount: state.turnCount,
      };
    } catch (err: any) {
      console.warn('[AutoCommitWorker] Background auto-commit warning:', err.message);
      return { committed: false, turnCount: state.turnCount };
    }
  }

  return { committed: false, turnCount: state.turnCount };
}

export async function handleGatherContext(sessionId?: string) {
  try {
    let targetSession = sessionId || 'default_session';
    const commits = getCommits(targetSession);

    if (commits.length === 0) {
      const allSessions = getAllSessions();
      const activeWithCommits = allSessions.find((s) => s.commitCount > 0);
      if (activeWithCommits) {
        targetSession = activeWithCommits.sessionId;
      }
    }

    // Prune transient logs older than 3 turns before reconstructing context
    pruneTransientLogs(targetSession);

    const reconstructed = await reconstructContext(targetSession);
    const allSessions = getAllSessions();
    const sessionInfo = allSessions.find((s) => s.sessionId === targetSession);

    if (!reconstructed.fullPromptText) {
      return {
        content: [
          {
            type: 'text',
            text: [
              `=== CONTEXT ENGINE — MEMORY RESTORED ===`,
              `Session: ${targetSession} | Branch: ${reconstructed.activeBranch} | Head: ${reconstructed.headCommitId || 'none'}`,
              ``,
              `No commits recorded yet. Use commit(topic, summary, kept_refs) to start building project memory.`,
              ``,
              `Format: commit("[Category] Title", "What/why", ["exact code or value"])`,
              `Categories: [Bug Fix] [Feature] [Config] [Design] [API] [Refactor] [Decision]`,
            ].join('\n'),
          },
        ],
      };
    }

    const keptCount = reconstructed.keptVerbatim.length;
    const tokensSaved = Math.max(0, reconstructed.rawTokenCount - reconstructed.reconstructedTokenCount);
    const allSessionsLine =
      allSessions.length > 1
        ? `Projects: ${allSessions.map((s) => `${s.sessionId}(${s.commitCount})`).join(', ')}`
        : '';

    return {
      content: [
        {
          type: 'text',
          text: [
            `=== CONTEXT ENGINE — MEMORY RESTORED ===`,
            `Session: ${targetSession} | Branch: ${reconstructed.activeBranch} | Head: ${reconstructed.headCommitId || 'none'}`,
            `Commits: ${sessionInfo?.commitCount ?? commits.length} | Kept facts: ${keptCount} | Savings: ${reconstructed.tokensSavedPct}% (${tokensSaved} tokens)`,
            allSessionsLine,
            ``,
            reconstructed.fullPromptText,
            ``,
            `[Memory fully restored. Proceed with full awareness of past decisions.]`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `[Context Engine] Failed to gather context: ${err.message}`,
        },
      ],
    };
  }
}

export async function handleRecall(sessionId: string, query: string, scope: 'branch' | 'all' = 'all') {
  try {
    if (!query || typeof query !== 'string') {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Error: A valid query string is required for recall.' }],
      };
    }

    let targetSession = sessionId;
    const activeBranch = getActiveBranch(targetSession);
    const targetBranch = scope === 'branch' ? activeBranch.name : undefined;
    let commits = getCommits(targetSession, targetBranch);

    if (commits.length === 0) {
      const allSessions = getAllSessions();
      const activeWithCommits = allSessions.find((s) => s.commitCount > 0);
      if (activeWithCommits) {
        targetSession = activeWithCommits.sessionId;
        commits = getCommits(targetSession, targetBranch);
      }
    }

    const queryLower = query.toLowerCase().trim();

    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await computeEmbedding(query);
    } catch {
      queryEmbedding = null;
    }

    const scoredCommits: { commit: (typeof commits)[0]; score: number }[] = [];

    for (const c of commits) {
      const topicLower = c.topic_label.toLowerCase();
      const reasonLower = c.reason_log.toLowerCase();
      const chunksText = (c.chunks || []).map((ch) => ch.content).join(' ');
      const chunksLower = chunksText.toLowerCase();

      let score = 0;

      if (queryLower === '*' || queryLower === 'all' || queryLower === '') {
        score = 1.0;
      } else {
        if (topicLower.includes(queryLower)) score += 3.0;
        if (reasonLower.includes(queryLower)) score += 1.5;
        if (chunksLower.includes(queryLower)) score += 2.0;

        const words = queryLower.split(/\s+/).filter((w) => w.length > 2);
        for (const w of words) {
          if (topicLower.includes(w)) score += 0.8;
          if (reasonLower.includes(w)) score += 0.4;
          if (chunksLower.includes(w)) score += 0.6;
        }

        if (queryEmbedding) {
          try {
            const cEmb = await computeEmbedding(`${c.topic_label}. ${c.reason_log}`);
            if (cEmb) {
              const sim = cosineSimilarity(queryEmbedding, cEmb);
              if (sim > 0.35) {
                score += sim * 2.5;
              }
            }
          } catch {
            // Non-fatal
          }
        }
      }

      if (score > 0) {
        scoredCommits.push({ commit: c, score });
      }
    }

    scoredCommits.sort((a, b) => b.score - a.score);
    const matchedCommits = scoredCommits.map((sc) => sc.commit);

    if (matchedCommits.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No commits matching query '${query}' found in ${scope} scope. Total commits checked: ${commits.length} in session '${targetSession}'.`,
          },
        ],
      };
    }

    const resultsFormatted = matchedCommits
      .map((c) => {
        const kept = (c.chunks || [])
          .filter((ch) => ch.label === 'keep_verbatim' && ch.tier !== 'transient')
          .map((ch) => ch.content);
        return `[Commit ${c.id}] Branch: ${c.branch} | Topic: ${c.topic_label}\nReason: ${c.reason_log}\nKept Facts:\n${kept.join('\n')}`;
      })
      .join('\n\n---\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${matchedCommits.length} matching commits for query '${query}' (Session: ${targetSession}):\n\n${resultsFormatted}`,
        },
      ],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Recall failed: ${err.message}` }],
    };
  }
}

export async function handleCommit(
  sessionId: string,
  topic: string,
  summary: string,
  kept_refs: string[] = []
) {
  try {
    if (!topic || !topic.trim()) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Commit failed: "topic" is required. Use format: "[Category] Short title" e.g. "[Bug Fix] Branch selection revert"',
          },
        ],
      };
    }

    const CATEGORIES = ['[Bug Fix]', '[Feature]', '[Config]', '[Design]', '[API]', '[Refactor]', '[Decision]'];
    const hasCategory = CATEGORIES.some((cat) => topic.trim().startsWith(cat));
    const formatNote = hasCategory ? '' : '\n⚠ Tip: Use a category prefix like "[Feature] My title" for better recall.';

    const activeBranch = getActiveBranch(sessionId);
    const safeKept = Array.isArray(kept_refs) ? kept_refs.map(String).filter(Boolean) : [];
    const safeSummary = summary ? String(summary) : topic;
    const currentTurn = getTurnCount(sessionId);

    // Apply dual-tier classification to filter out accidental transient dumps in kept_refs
    const chunks = [
      ...safeKept.map((ref) => {
        const classification = classifyTextTier(ref);
        const label: TriageLabel = classification.tier === 'transient' ? 'discard' : 'keep_verbatim';
        return {
          content: ref,
          label,
          tier: classification.tier,
          turn: currentTurn,
          source_ref: 'mcp_kept_ref',
        };
      }),
      {
        content: safeSummary,
        label: 'summarize' as const,
        tier: 'conversational' as const,
        turn: currentTurn,
        source_ref: 'mcp_summary',
      },
    ];

    const newCommit = coreCommit(sessionId, activeBranch.name, topic.trim(), safeSummary, chunks, undefined, currentTurn);

    const preservedFacts = chunks.filter((c) => c.label === 'keep_verbatim').length;

    return {
      content: [
        {
          type: 'text',
          text: `✓ Committed to branch '${activeBranch.name}'
  ID:      ${newCommit.id}
  Topic:   ${topic}
  Branch:  ${activeBranch.name}
  Kept:    ${preservedFacts} permanent ref${preservedFacts !== 1 ? 's' : ''}${formatNote}`,
        },
      ],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Commit failed: ${err.message}` }],
    };
  }
}

export async function handleBranch(sessionId: string, name: string, from_commit?: string) {
  try {
    if (!name || !name.trim()) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Branch failed: Branch name is required.' }],
      };
    }

    const existing = getBranches(sessionId).find((b) => b.name === name.trim());
    const resultBranch = coreBranch(sessionId, name.trim(), from_commit);
    const action = existing ? 'Switched to existing branch' : 'Created and switched to new branch';

    return {
      content: [
        {
          type: 'text',
          text: `${action} '${resultBranch.name}'. Head commit: ${resultBranch.head_commit_id || 'root (no commits yet)'}.`,
        },
      ],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Branch failed: ${err.message}` }],
    };
  }
}

export async function handleMerge(sessionId: string, source_branch: string, target_branch: string = 'main') {
  try {
    if (!source_branch || !source_branch.trim()) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Merge failed: source_branch is required.' }],
      };
    }

    const res = coreMerge(sessionId, source_branch.trim(), target_branch.trim());

    if (!res.success) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `CONFLICT DETECTED! Merge from '${source_branch}' into '${target_branch}' failed.\nConflict ID: ${res.conflict?.id}\nDescription: ${res.conflict?.description}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Successfully merged '${source_branch}' into '${target_branch}'. Merge Commit ID: ${res.mergedCommitId}`,
        },
      ],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Merge failed: ${err.message}`,
        },
      ],
    };
  }
}

export async function handleCheckout(sessionId: string, commit_id: string) {
  try {
    if (!commit_id || !commit_id.trim()) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Checkout failed: commit_id is required.' }],
      };
    }
    coreCheckout(sessionId, commit_id.trim());
    return {
      content: [
        {
          type: 'text',
          text: `Successfully checked out commit ${commit_id}.`,
        },
      ],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Checkout failed: ${err.message}`,
        },
      ],
    };
  }
}

/**
 * Visual Markdown Text Graph Tree of all branches, commits, and saved memory states straight to the chat view.
 */
export async function handleGetContextTree(sessionId: string = 'default_session') {
  try {
    const treeText = getContextTree(sessionId);
    return {
      content: [
        {
          type: 'text',
          text: treeText,
        },
      ],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to generate context tree: ${err.message}` }],
    };
  }
}

/**
 * Power user manual override: Forcibly overwrite any node in the SQLite history graph,
 * pruning incorrect details or debug junk.
 */
export async function handleOverrideMemoryNode(
  sessionId: string,
  commitId: string,
  options: OverrideNodeOptions
) {
  try {
    if (!commitId || !commitId.trim()) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Override failed: commit_id is required.' }],
      };
    }

    const updated = overrideMemoryNode(commitId.trim(), options);
    const keptCount = (updated.chunks || []).filter((ch) => ch.label === 'keep_verbatim').length;

    return {
      content: [
        {
          type: 'text',
          text: `✓ Memory node '${updated.id}' successfully overwritten and pruned.
  Topic:      ${updated.topic_label}
  Summary:    ${updated.reason_log}
  Kept Facts: ${keptCount} permanent architectural fact${keptCount !== 1 ? 's' : ''}`,
        },
      ],
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Override failed: ${err.message}` }],
    };
  }
}
