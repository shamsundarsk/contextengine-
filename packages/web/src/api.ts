import {
  Branch,
  Commit,
  Conflict,
  ReconstructedContext,
  SessionStats,
  SessionSummary,
  TriageLabel,
} from '@context-engine/core';

const API_BASE = '/api';

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  const data = await res.json();
  return data.sessions || [];
}

export async function fetchContext(sessionId: string = 'default_session'): Promise<ReconstructedContext> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/context`);
  if (!res.ok) throw new Error('Failed to fetch reconstructed context');
  return res.json();
}

export async function gatherQuery(
  sessionId: string = 'default_session',
  query: string = '',
  scope: 'branch' | 'all' = 'all'
): Promise<{
  sessionId: string;
  query: string;
  matchedCommitsCount: number;
  gatheredFactsCount: number;
  facts: { commitId: string; topic: string; branch: string; content: string; sourceRef?: string }[];
  commits: Commit[];
}> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/gather`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, scope }),
  });
  if (!res.ok) throw new Error('Failed to run gather query');
  return res.json();
}

export async function fetchStats(sessionId: string = 'default_session'): Promise<SessionStats> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchBranches(sessionId: string = 'default_session'): Promise<Branch[]> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/branches`);
  if (!res.ok) throw new Error('Failed to fetch branches');
  return res.json();
}

export async function fetchCommits(
  sessionId: string = 'default_session',
  branchName?: string
): Promise<Commit[]> {
  const url = branchName
    ? `${API_BASE}/sessions/${sessionId}/commits?branch=${encodeURIComponent(branchName)}`
    : `${API_BASE}/sessions/${sessionId}/commits`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch commits');
  return res.json();
}

export async function fetchCommit(commitId: string): Promise<Commit> {
  const res = await fetch(`${API_BASE}/commits/${commitId}`);
  if (!res.ok) throw new Error('Failed to fetch commit details');
  return res.json();
}

export async function fetchConflicts(sessionId?: string): Promise<Conflict[]> {
  const url = sessionId ? `${API_BASE}/conflicts?session_id=${sessionId}` : `${API_BASE}/conflicts`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch conflicts');
  return res.json();
}

export async function checkoutCommit(sessionId: string, commitId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, commitId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Checkout failed');
  }
}

export async function createBranch(
  sessionId: string,
  name: string,
  fromCommitId?: string
): Promise<Branch> {
  const res = await fetch(`${API_BASE}/branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, name, fromCommitId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Create branch failed');
  }
  const data = await res.json();
  return data.branch;
}

export async function switchBranch(sessionId: string, name: string): Promise<Branch> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/branch/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Switch branch failed');
  }
  const data = await res.json();
  return data.branch;
}

export async function mergeBranch(
  sessionId: string,
  sourceBranch: string,
  targetBranch: string = 'main'
): Promise<{ success: boolean; conflict?: Conflict; mergedCommitId?: string }> {
  const res = await fetch(`${API_BASE}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, sourceBranch, targetBranch }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Merge failed');
  }
  return res.json();
}

export async function promoteChunk(chunkId: string, newLabel: TriageLabel): Promise<any> {
  const res = await fetch(`${API_BASE}/commits/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunkId, newLabel }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Promote chunk failed');
  }
}

export async function resolveConflict(conflictId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conflicts/${conflictId}/resolve`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Resolve conflict failed');
  }
}

export async function fetchContextTree(sessionId: string = 'default_session'): Promise<string> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/tree`);
  if (!res.ok) throw new Error('Failed to fetch context tree');
  const data = await res.json();
  return data.tree || '';
}
