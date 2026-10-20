import {
  getBranches,
  getCommits,
  getStats,
  getAllSessions,
  getActiveBranch,
  checkout,
  branch,
  SessionStats,
  Branch,
  Commit,
} from '@context-engine/core';

export function getSessionData(sessionId: string) {
  const stats: SessionStats = getStats(sessionId);
  const branches: Branch[] = getBranches(sessionId);
  const commits: Commit[] = getCommits(sessionId);
  return { stats, branches, commits };
}

export function executeCheckout(sessionId: string, commitId: string) {
  checkout(sessionId, commitId);
}

export function executeBranch(sessionId: string, name: string) {
  branch(sessionId, name);
}

// ─── status ──────────────────────────────────────────────────────────────────

export function executeStatus(sessionId: string) {
  const stats = getStats(sessionId);
  const activeBranch = getActiveBranch(sessionId);

  const dim = '\x1b[2m';
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const cyan = '\x1b[36m';
  const green = '\x1b[32m';
  const yellow = '\x1b[33m';

  console.log('');
  console.log(`${bold}Context Engine — Status${reset}`);
  console.log(`${dim}${'─'.repeat(44)}${reset}`);
  console.log(`  Session     ${cyan}${stats.sessionId}${reset}`);
  console.log(`  Branch      ${green}${activeBranch.name}${reset}`);
  console.log(`  Head commit ${dim}${activeBranch.head_commit_id ?? '(none)'}${reset}`);
  console.log('');
  console.log(`  Commits     ${stats.totalCommits}`);
  console.log(`  Kept refs   ${stats.keptVerbatimCount}`);
  console.log(`  Summarized  ${stats.summarizedCount}`);
  console.log(`  Conflicts   ${stats.conflictCount > 0 ? `${yellow}${stats.conflictCount}${reset}` : '0'}`);
  console.log('');
  console.log(`  Tokens (raw)      ${stats.totalOriginalTokens.toLocaleString()}`);
  console.log(`  Tokens (optimized) ${stats.totalOptimizedTokens.toLocaleString()}`);
  console.log(`  Savings           ${bold}${stats.tokensSavedPct}%${reset}  (~$${stats.estimatedCostSavedUSD.toFixed(4)} saved)`);
  console.log('');
}

// ─── log ─────────────────────────────────────────────────────────────────────

export function executeLog(sessionId: string, branchName?: string, limit = 20) {
  const activeBranch = getActiveBranch(sessionId);
  const branch = branchName ?? activeBranch.name;
  const commits = getCommits(sessionId, branch).slice(0, limit);

  const dim = '\x1b[2m';
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const yellow = '\x1b[33m';
  const cyan = '\x1b[36m';

  console.log('');
  console.log(`${bold}Commit Log${reset}  ${dim}branch: ${branch} — session: ${sessionId}${reset}`);
  console.log(`${dim}${'─'.repeat(60)}${reset}`);

  if (commits.length === 0) {
    console.log(`  ${dim}No commits on this branch yet.${reset}`);
  } else {
    for (const c of commits) {
      const date = new Date(c.timestamp).toLocaleString();
      const kept = (c.chunks ?? []).filter((ch) => ch.label === 'keep_verbatim').length;
      const headMark = c.id === activeBranch.head_commit_id ? ` ${cyan}← HEAD${reset}` : '';
      console.log(`  ${yellow}${c.id.slice(0, 20)}…${reset}${headMark}`);
      console.log(`  ${bold}${c.topic_label}${reset}`);
      console.log(`  ${dim}${date}  •  ${kept} kept refs${reset}`);
      console.log('');
    }
  }
}

// ─── branches ────────────────────────────────────────────────────────────────

export function executeBranches(sessionId: string) {
  const branches = getBranches(sessionId);
  const active = getActiveBranch(sessionId);

  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const green = '\x1b[32m';
  const dim = '\x1b[2m';

  console.log('');
  console.log(`${bold}Branches${reset}  ${dim}session: ${sessionId}${reset}`);
  console.log(`${dim}${'─'.repeat(44)}${reset}`);

  for (const b of branches) {
    const isActive = b.name === active.name;
    const marker = isActive ? `${green}*${reset} ` : '  ';
    const head = b.head_commit_id ? `${dim}${b.head_commit_id.slice(0, 16)}…${reset}` : `${dim}(no commits)${reset}`;
    console.log(`${marker}${isActive ? `${bold}${b.name}${reset}` : b.name}  ${head}`);
  }
  console.log('');
}

// ─── sessions ────────────────────────────────────────────────────────────────

export function executeSessions() {
  const sessions = getAllSessions();

  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const cyan = '\x1b[36m';
  const dim = '\x1b[2m';

  console.log('');
  console.log(`${bold}Context Engine — All Projects / Sessions${reset}`);
  console.log(`${dim}${'─'.repeat(52)}${reset}`);

  if (sessions.length === 0) {
    console.log(`  ${dim}No sessions found in context.db${reset}`);
  } else {
    for (const s of sessions) {
      const date = new Date(s.lastActive).toLocaleString();
      console.log(`  ${cyan}${s.sessionId}${reset}`);
      console.log(`  ${dim}Branch: ${s.activeBranch}  •  ${s.commitCount} commits  •  ${date}${reset}`);
      console.log('');
    }
  }
}
