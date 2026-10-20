import { describe, it, expect, beforeEach } from 'vitest';
import { initInMemoryDatabase } from '@context-engine/core';
import {
  handleCommit,
  handleRecall,
  handleBranch,
  handleMerge,
  handleCheckout,
  handleGatherContext,
  handleGetContextTree,
  handleOverrideMemoryNode,
  autoBranchOnContextShift,
  recordTurnAndAutoCommit,
  resetTurnCount,
} from '../src/tools.js';

describe('MCP Server Tools & Hybrid Control', () => {
  const sessionId = 'test_mcp_session';

  beforeEach(() => {
    initInMemoryDatabase();
    resetTurnCount(sessionId);
  });

  it('handles gather_context and recall on a completely blank database gracefully', async () => {
    // 1. Gather context on empty DB
    const gatherRes = await handleGatherContext(sessionId);
    expect(gatherRes.content[0].text).toContain('No commits recorded yet');

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
    expect(gatherRes.content[0].text).toContain('Kept facts: 2');
  });

  it('handles branching, merging, and checkout tool calls', async () => {
    const b1 = await handleBranch(sessionId, 'feature-cache');
    expect(b1.content[0].text).toContain('feature-cache');

    await handleCommit(sessionId, 'Caching', 'Added Redis cache layer', ['Redis port 6379']);

    const mergeRes = await handleMerge(sessionId, 'feature-cache', 'main');
    expect(mergeRes.content[0].text).toContain('Successfully merged');
  });

  it('handles get_context_tree tool call', async () => {
    await handleCommit(sessionId, '[Feature] Database Schema', 'Configured SQLite WAL mode', [
      'SQLite WAL mode active',
    ]);

    const treeRes = await handleGetContextTree(sessionId);
    expect(treeRes.content[0].text).toContain('Context Memory Graph Tree');
    expect(treeRes.content[0].text).toContain('[Feature] Database Schema');
    expect(treeRes.content[0].text).toContain('**Preserved Architectural Facts**: 1');
  });

  it('handles override_memory_node tool call', async () => {
    const cRes = await handleCommit(sessionId, '[Bug] Initial Bug', 'Faulty initial explanation', [
      'Bad fact 1',
    ]);
    const commitIdMatch = cRes.content[0].text.match(/ID:\s+(commit_\w+)/);
    expect(commitIdMatch).toBeTruthy();
    const commitId = commitIdMatch![1];

    const overrideRes = await handleOverrideMemoryNode(sessionId, commitId, {
      new_topic: '[Bug Fix] Verified Resolution',
      new_summary: 'Clean verified explanation after fix',
      prune_transient: true,
      kept_chunks: ['Verified resolution fact'],
    });

    expect(overrideRes.content[0].text).toContain('successfully overwritten and pruned');
    expect(overrideRes.content[0].text).toContain('[Bug Fix] Verified Resolution');

    const recallRes = await handleRecall(sessionId, 'resolution');
    expect(recallRes.content[0].text).toContain('Verified resolution fact');
  });

  it('handles auto-branching on context shift', () => {
    const res = autoBranchOnContextShift(sessionId, '/workspace/packages/backend');
    expect(res.branched).toBe(true);
    expect(res.branchName).toBe('auto-branch-backend');

    // Calling again with same path should not duplicate or recreate
    const res2 = autoBranchOnContextShift(sessionId, '/workspace/packages/backend');
    expect(res2.branched).toBe(false);
  });

  it('handles autonomous background auto-committing every 5 turns', async () => {
    // Turns 1 to 4 should buffer without committing
    for (let i = 1; i <= 4; i++) {
      const res = await recordTurnAndAutoCommit(sessionId, `Turn ${i} conversation message`, 'user');
      expect(res.committed).toBe(false);
      expect(res.turnCount).toBe(i);
    }

    // Turn 5 should automatically trigger background commit
    const res5 = await recordTurnAndAutoCommit(
      sessionId,
      'Architectural decision: We will use stdio transport for the MCP server.',
      'user'
    );
    expect(res5.committed).toBe(true);
    expect(res5.turnCount).toBe(5);
    expect(res5.commitId).toBeTruthy();

    // Check that context tree now includes the auto-milestone
    const treeRes = await handleGetContextTree(sessionId);
    expect(treeRes.content[0].text).toContain('[Auto-Milestone] Turn 5');
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

    // Override non-existent commit
    const errOverride = await handleOverrideMemoryNode(sessionId, 'fake_commit_id', {
      new_summary: 'New summary',
    });
    expect(errOverride.isError).toBe(true);
    expect(errOverride.content[0].text).toContain('Override failed');
  });
});
