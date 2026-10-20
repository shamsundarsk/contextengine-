import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getBranches,
  getCommits,
  getCommit,
  getStats,
  getConflicts,
  getAllSessions,
  reconstructContext,
  resolveConflict,
  checkout,
  branch,
  merge,
  promoteChunk,
  getActiveBranch,
} from '@context-engine/core';

import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const app = express();
const port = process.env.WEB_SERVER_PORT || 3001;

app.use(cors());
app.use(express.json());

// List all active sessions from DB
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = getAllSessions();
    res.json({ sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reconstruct and gather full bounded context for a session
app.get('/api/sessions/:id/context', async (req, res) => {
  const sessionId = req.params.id || 'default_session';
  try {
    const context = await reconstructContext(sessionId);
    res.json(context);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Live recall/gather search endpoint for Context Gatherer simulator
app.post('/api/sessions/:id/gather', async (req, res) => {
  const sessionId = req.params.id || 'default_session';
  const { query = '', scope = 'all' } = req.body;

  try {
    const targetBranch = scope === 'branch' ? getActiveBranch(sessionId).name : undefined;
    const commits = getCommits(sessionId, targetBranch);
    const queryLower = String(query).toLowerCase().trim();

    const matchedCommits = commits.filter((c) => {
      if (!queryLower || queryLower === '*' || queryLower === 'all') return true;
      const topicMatch = c.topic_label.toLowerCase().includes(queryLower);
      const reasonMatch = c.reason_log.toLowerCase().includes(queryLower);
      const chunkMatch = (c.chunks || []).some((ch) => ch.content.toLowerCase().includes(queryLower));
      return topicMatch || reasonMatch || chunkMatch;
    });

    const gatheredFacts = matchedCommits.flatMap((c) =>
      (c.chunks || [])
        .filter((ch) => ch.label === 'keep_verbatim')
        .map((ch) => ({
          commitId: c.id,
          topic: c.topic_label,
          branch: c.branch,
          content: ch.content,
          sourceRef: ch.source_ref,
        }))
    );

    res.json({
      sessionId,
      query,
      matchedCommitsCount: matchedCommits.length,
      gatheredFactsCount: gatheredFacts.length,
      facts: gatheredFacts,
      commits: matchedCommits,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions/:id/stats', (req, res) => {
  const sessionId = req.params.id || 'default_session';
  const stats = getStats(sessionId);
  res.json(stats);
});

app.get('/api/sessions/:id/branches', (req, res) => {
  const sessionId = req.params.id || 'default_session';
  const branches = getBranches(sessionId);
  res.json(branches);
});

app.get('/api/sessions/:id/commits', (req, res) => {
  const sessionId = req.params.id || 'default_session';
  const branchName = req.query.branch as string | undefined;
  const commits = getCommits(sessionId, branchName);
  res.json(commits);
});

app.get('/api/commits/:id', (req, res) => {
  const commitObj = getCommit(req.params.id);
  if (!commitObj) {
    return res.status(404).json({ error: 'Commit not found' });
  }
  res.json(commitObj);
});

app.get('/api/conflicts', (req, res) => {
  const sessionId = (req.query.session_id as string) || undefined;
  const conflicts = getConflicts(sessionId);
  res.json(conflicts);
});

app.post('/api/checkout', (req, res) => {
  const { sessionId = 'default_session', commitId } = req.body;
  if (!commitId) {
    return res.status(400).json({ error: 'commitId is required' });
  }
  try {
    checkout(sessionId, commitId);
    res.json({ success: true, message: `Checked out commit ${commitId}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/branch', (req, res) => {
  const { sessionId = 'default_session', name, fromCommitId } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Branch name is required' });
  }
  try {
    const created = branch(sessionId, name, fromCommitId);
    res.json({ success: true, branch: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Switch to an existing branch by name (persists is_active in DB)
app.post('/api/sessions/:id/branch/switch', (req, res) => {
  const sessionId = req.params.id || 'default_session';
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Branch name is required' });
  }
  try {
    const switched = branch(sessionId, name);
    res.json({ success: true, branch: switched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Rename a session (project name)
app.post('/api/sessions/:id/rename', (req, res) => {
  const oldId = req.params.id;
  const { newId } = req.body;
  if (!newId || !newId.trim()) {
    return res.status(400).json({ error: 'newId is required' });
  }
  try {
    const { renameSession } = require('@context-engine/core');
    renameSession(oldId, newId.trim());
    res.json({ success: true, newId: newId.trim() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/merge', (req, res) => {
  const { sessionId = 'default_session', sourceBranch, targetBranch = 'main' } = req.body;
  if (!sourceBranch) {
    return res.status(400).json({ error: 'sourceBranch is required' });
  }
  try {
    const result = merge(sessionId, sourceBranch, targetBranch);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/commits/promote', (req, res) => {
  const { chunkId, newLabel } = req.body;
  if (!chunkId || !newLabel) {
    return res.status(400).json({ error: 'chunkId and newLabel are required' });
  }
  try {
    const overrideCommit = promoteChunk(chunkId, newLabel);
    res.json({ success: true, commit: overrideCommit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/conflicts/:id/resolve', (req, res) => {
  try {
    resolveConflict(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`[Context Engine Web API] Express REST backend running on http://localhost:${port}`);
});

export default app;
