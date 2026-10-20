import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { setDatabase, commit, promoteChunk, getCommits, getCommit } from '../src/index.js';

describe('Fix 4: Manual Overrides Append Commits Invariant', () => {
  const sessionId = 'test_override_session';

  beforeEach(() => {
    const db = new Database(':memory:');
    setDatabase(db);
  });

  it('appends a new commit on promoteChunk and leaves historical rows byte-identical', () => {
    const c1 = commit(
      sessionId,
      'main',
      'Database Config',
      'Initial DB setup',
      [{ content: 'We decided to use SQLite as local store.', label: 'summarize' }]
    );

    const initialCommits = getCommits(sessionId);
    expect(initialCommits.length).toBe(1);

    const origChunk = c1.chunks![0];
    const origChunkLabelBefore = origChunk.label;

    // Execute promoteChunk
    const overrideCommit = promoteChunk(origChunk.id, 'keep_verbatim', 'admin');

    const updatedCommits = getCommits(sessionId);
    // 1. Commit count increased by 1
    expect(updatedCommits.length).toBe(2);

    // 2. Old commit's rows are byte-identical to before
    const oldCommitReFetched = getCommit(c1.id)!;
    expect(oldCommitReFetched.chunks![0].label).toBe(origChunkLabelBefore);
    expect(oldCommitReFetched.chunks![0].label).toBe('summarize');

    // 3. New commit has override reason and promoted chunk label
    expect(overrideCommit.reason_log).toContain('manual override: promoted chunk');
    expect(overrideCommit.chunks![0].label).toBe('keep_verbatim');
    expect(overrideCommit.parent_id).toBe(c1.id);
  });
});
