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
} from '@context-engine/core';

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
    const allSessionsLine = allSessions.length > 1
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
          ].filter(Boolean).join('\n'),
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
        const kept = (c.chunks || []).filter((ch) => ch.label === 'keep_verbatim').map((ch) => ch.content);
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
        content: [{ type: 'text', text: 'Commit failed: "topic" is required. Use format: "[Category] Short title" e.g. "[Bug Fix] Branch selection revert"' }],
      };
    }

    // Nudge toward structured topic format (non-blocking — just adds a note)
    const CATEGORIES = ['[Bug Fix]', '[Feature]', '[Config]', '[Design]', '[API]', '[Refactor]', '[Decision]'];
    const hasCategory = CATEGORIES.some((cat) => topic.trim().startsWith(cat));
    const formatNote = hasCategory ? '' : '\n⚠ Tip: Use a category prefix like "[Feature] My title" for better recall.';

    const activeBranch = getActiveBranch(sessionId);
    const safeKept = Array.isArray(kept_refs) ? kept_refs.map(String).filter(Boolean) : [];
    const safeSummary = summary ? String(summary) : topic;

    const chunks = [
      ...safeKept.map((ref) => ({
        content: ref,
        label: 'keep_verbatim' as const,
        source_ref: 'mcp_kept_ref',
      })),
      {
        content: safeSummary,
        label: 'summarize' as const,
        source_ref: 'mcp_summary',
      },
    ];

    const newCommit = coreCommit(sessionId, activeBranch.name, topic.trim(), safeSummary, chunks);

    return {
      content: [
        {
          type: 'text',
          text: `✓ Committed to branch '${activeBranch.name}'
  ID:      ${newCommit.id}
  Topic:   ${topic}
  Branch:  ${activeBranch.name}
  Kept:    ${safeKept.length} verbatim ref${safeKept.length !== 1 ? 's' : ''}${formatNote}`,
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

    // Detect if branch already exists before calling core (to give accurate feedback)
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
