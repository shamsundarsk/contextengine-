import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { setDatabase, commit, branch, checkout, merge, reconstructContext, getConflicts } from '../src/index.js';

describe('Core Graph & Versioning Logic', () => {
  const sessionId = 'test_session_1';

  beforeEach(() => {
    // Fresh in-memory database for isolated tests
    const db = new Database(':memory:');
    setDatabase(db);
  });

  it('creates commits and branches successfully', () => {
    const c1 = commit(
      sessionId,
      'main',
      'Architecture',
      'Initial architecture setup',
      [
        { content: 'We decided to use SQLite as the database.', label: 'keep_verbatim' },
        { content: 'Some chatter about setup steps.', label: 'discard' },
      ]
    );

    expect(c1.id).toBeDefined();
    expect(c1.chunks?.length).toBe(2);

    const b1 = branch(sessionId, 'feature-auth', c1.id);
    expect(b1.name).toBe('feature-auth');
    expect(b1.head_commit_id).toBe(c1.id);
  });

  it('supports checkout and branching', async () => {
    const c1 = commit(sessionId, 'main', 'DB Setup', 'Database setup', [
      { content: 'Database schema created.', label: 'keep_verbatim' },
    ]);

    const c2 = commit(sessionId, 'main', 'API Setup', 'REST API setup', [
      { content: 'Express server listening on port 4000.', label: 'keep_verbatim' },
    ]);

    checkout(sessionId, c1.id);
    const ctx = await reconstructContext(sessionId);
    expect(ctx.headCommitId).toBe(c1.id);
  });

  it('detects conflicting facts during merge without auto-resolving', () => {
    const cMain = commit(sessionId, 'main', 'Database Choice', 'Base DB decision', [
      { content: 'We use SQLite for local storage.', label: 'keep_verbatim' },
    ]);

    branch(sessionId, 'feat-postgres', cMain.id);

    const cFeat = commit(sessionId, 'feat-postgres', 'Database Choice', 'Switch to Postgres', [
      { content: 'We use PostgreSQL for database storage.', label: 'keep_verbatim' },
    ]);

    const mergeResult = merge(sessionId, 'feat-postgres', 'main');
    expect(mergeResult.success).toBe(false);
    expect(mergeResult.conflict).toBeDefined();
    expect(mergeResult.conflict?.topic_label).toBe('Database Choice');

    const conflicts = getConflicts(sessionId);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].resolved).toBe(false);
  });

  it('successfully merges non-conflicting branches', () => {
    const cMain = commit(sessionId, 'main', 'Database Setup', 'SQLite config', [
      { content: 'SQLite database is configured.', label: 'keep_verbatim' },
    ]);

    branch(sessionId, 'feat-cache', cMain.id);

    const cCache = commit(sessionId, 'feat-cache', 'Caching Strategy', 'Redis caching', [
      { content: 'Redis is used for caching session state.', label: 'keep_verbatim' },
    ]);

    const mergeResult = merge(sessionId, 'feat-cache', 'main');
    expect(mergeResult.success).toBe(true);
    expect(mergeResult.mergedCommitId).toBeDefined();
  });
});
