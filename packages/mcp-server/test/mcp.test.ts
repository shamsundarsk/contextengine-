import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { setDatabase } from '@context-engine/core';
import {
  handleCommit,
  handleRecall,
  handleBranch,
  handleMerge,
  handleCheckout,
  handleGatherContext,
} from '../src/tools.js';

describe('MCP Server Tools', () => {
  const sessionId = 'test_mcp_session';

  beforeEach(() => {
    const db = new Database(':memory:');
    setDatabase(db);
  });

  it('handles gather_context and recall on a completely blank database gracefully', async () => {
    // 1. Gather context on empty DB
    const gatherRes = await handleGatherContext(sessionId);
    expect(gatherRes.content[0].text).toContain('No previous commits recorded yet');

    // 2. Recall on empty DB
    const recallRes = await handleRecall(sessionId, 'anything');
    expect(recallRes.content[0].text).toContain('No commits matching query');
  });

  it('handles commit and recall tool calls', async () => {
    const commitRes = await handleCommit(
      sessionId,
      'Auth Spec',
      'Configured JWT token expiration',
      ['JWT secret stored in ENV', 'Tokens expire in 24h']
    );

    expect(commitRes.content[0].text).toContain('Auth Spec');

    const recallRes = await handleRecall(sessionId, 'JWT');
    expect(recallRes.content[0].text).toContain('JWT secret stored in ENV');

    const gatherRes = await handleGatherContext(sessionId);
    expect(gatherRes.content[0].text).toContain('JWT secret stored in ENV');
    expect(gatherRes.content[0].text).toContain('Preserved Architectural Facts: 2');
  });

  it('handles branching, merging, and checkout tool calls', async () => {
    const b1 = await handleBranch(sessionId, 'feature-cache');
    expect(b1.content[0].text).toContain('feature-cache');

    await handleCommit(sessionId, 'Caching', 'Added Redis cache layer', ['Redis port 6379']);

    const mergeRes = await handleMerge(sessionId, 'feature-cache', 'main');
    expect(mergeRes.content[0].text).toContain('Successfully merged');
  });

  it('handles error states gracefully with isError: true without throwing', async () => {
    // Empty topic on commit
    const errCommit = await handleCommit(sessionId, '', 'some summary');
    expect(errCommit.isError).toBe(true);
    expect(errCommit.content[0].text).toContain('Commit failed');

    // Empty branch name
    const errBranch = await handleBranch(sessionId, '   ');
    expect(errBranch.isError).toBe(true);
    expect(errBranch.content[0].text).toContain('Branch name is required');

    // Merge non-existent branch or branch with 0 commits
    const errMerge = await handleMerge(sessionId, 'nonexistent-branch', 'main');
    expect(errMerge.isError).toBe(true);
    expect(errMerge.content[0].text).toContain('Merge failed');

    // Checkout non-existent commit
    const errCheckout = await handleCheckout(sessionId, 'fake_commit_id');
    expect(errCheckout.isError).toBe(true);
    expect(errCheckout.content[0].text).toContain('Checkout failed');
  });
});
