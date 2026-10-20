import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import {
  setDatabase,
  commit,
  getCommit,
  classifyTextTier,
  scoreChunk,
  pruneTransientLogs,
  overrideMemoryNode,
  getContextTree,
  getDefaultDbPath,
  registerSampler,
  summarize,
  reconstructContext,
} from '../src/index.js';

describe('Refactored Production Architecture Features', () => {
  const sessionId = 'test_feature_session';

  beforeEach(() => {
    const db = new Database(':memory:');
    setDatabase(db);
    registerSampler(null);
  });

  describe('Local-First Privacy Shield & Path Protection', () => {
    it('initializes default db path in user home config folder', () => {
      const defaultPath = getDefaultDbPath();
      const expectedBase = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      expect(defaultPath).toBe(path.join(expectedBase, 'context-engine', 'context.db'));
    });
  });

  describe('Dual-Tier Text Categorization & Pruning Filter', () => {
    it('classifies ephemeral terminal logs, test dumps, stack traces, and PIDs as transient', () => {
      const testLog = 'FAIL test/mcp.test.ts > MCP Server Tools > 3 tests passed, 1 failed in 24ms';
      const stackTrace = 'at Object.<anonymous> (/Users/user/project/node_modules/vite/dist/node/chunks/dep.js:51969:17)';
      const compilerLog = 'npm ERR! code 1\nnpm ERR! path /Users/user/project\npid 48291 exit code 1';
      const pidLog = 'Listening on port 4000, pid 19284, memory: 42mb';

      expect(classifyTextTier(testLog).tier).toBe('transient');
      expect(classifyTextTier(stackTrace).tier).toBe('transient');
      expect(classifyTextTier(compilerLog).tier).toBe('transient');
      expect(classifyTextTier(pidLog).tier).toBe('transient');
    });

    it('classifies permanent schemas, configurations, and architectural decisions as architectural', () => {
      const schema = 'CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER);';
      const decision = 'We decided to use SQLite with WAL mode and stdio MCP transport for local-first privacy.';
      const envConfig = 'export const DATABASE_URL = process.env.DATABASE_URL || "postgres://localhost:5432";';
      const apiSpec = 'POST /v1/chat/completions schema endpoint contract';

      expect(classifyTextTier(schema).tier).toBe('architectural');
      expect(classifyTextTier(decision).tier).toBe('architectural');
      expect(classifyTextTier(envConfig).tier).toBe('architectural');
      expect(classifyTextTier(apiSpec).tier).toBe('architectural');
    });

    it('scoreChunk discards transient debug junk instead of giving it keep_verbatim', async () => {
      const junkWithNumbers = 'FAIL test/server.test.ts (2 failed, 4 passed) pid 89281 exit code 1';
      const result = await scoreChunk(junkWithNumbers);
      expect(result.label).toBe('discard');
      expect(result.tier).toBe('transient');
      expect(result.reason).toContain('Transient Log');
    });

    it('scoreChunk locks architectural decisions into keep_verbatim', async () => {
      const arch = 'Architectural decision: We will use stdio transport for the MCP server.';
      const result = await scoreChunk(arch);
      expect(result.label).toBe('keep_verbatim');
      expect(result.tier).toBe('architectural');
      expect(result.reason).toContain('Architectural Decision');
    });
  });

  describe('Transient Log Auto-Pruning Engine', () => {
    it('prunes transient logs older than 3 conversational turns', () => {
      // Commit at turn 1 with transient junk
      commit(
        sessionId,
        'main',
        'Turn 1 Test Run',
        'Ran tests with failures',
        [{ content: 'FAIL vitest run 4 tests failed pid 1111', label: 'discard', tier: 'transient', turn: 1 }],
        undefined,
        1
      );

      // Commit at turn 2 with architectural fact
      commit(
        sessionId,
        'main',
        'Turn 2 Config',
        'Added auth config',
        [{ content: 'process.env.AUTH_SECRET = "jwt_secret"', label: 'keep_verbatim', tier: 'architectural', turn: 2 }],
        undefined,
        2
      );

      // Commit at turn 5
      commit(
        sessionId,
        'main',
        'Turn 5 Deployment',
        'Deployed service',
        [{ content: 'Deployment completed', label: 'summarize', tier: 'conversational', turn: 5 }],
        undefined,
        5
      );

      // Prune at turn 5 (maxTurns: 3 -> keep turn >= 5 - 3 = 2; turn 1 must be pruned)
      const pruned = pruneTransientLogs(sessionId, 5, 3);
      expect(pruned).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Power User Override & Visual Context Tree', () => {
    it('override_memory_node forcibly updates text and prunes transient junk', () => {
      const c = commit(
        sessionId,
        'main',
        'Old Topic',
        'Old summary with wrong info',
        [
          { content: 'Old fact to replace', label: 'keep_verbatim', tier: 'conversational' },
          { content: 'Debug garbage pid 1234 error stack', label: 'discard', tier: 'transient' },
        ]
      );

      const updated = overrideMemoryNode(c.id, {
        new_topic: '[Architectural Fix] Corrected Auth',
        new_summary: 'Clean verified explanation of JWT auth',
        prune_transient: true,
        kept_chunks: ['Verified JWT Secret: production_key_2026'],
      });

      expect(updated.topic_label).toBe('[Architectural Fix] Corrected Auth');
      expect(updated.reason_log).toBe('Clean verified explanation of JWT auth');
      expect(updated.chunks?.length).toBe(1);
      expect(updated.chunks?.[0].content).toBe('Verified JWT Secret: production_key_2026');
    });

    it('get_context_tree produces clean markdown visual tree', () => {
      commit(sessionId, 'main', '[Feature] Auth Layer', 'Implemented token rotation', [
        { content: 'Tokens expire in 3600s', label: 'keep_verbatim', tier: 'architectural' },
      ]);

      const tree = getContextTree(sessionId);
      expect(tree).toContain('🌳 Context Memory Graph Tree');
      expect(tree).toContain('[main]');
      expect(tree).toContain('[Feature] Auth Layer');
      expect(tree).toContain('**Preserved Architectural Facts**: 1');
    });
  });

  describe('Native MCP Sampling API Integration', () => {
    it('summarize utilizes registered host LLM sampler instead of external APIs', async () => {
      let samplerCalledWith = '';
      registerSampler(async (prompt: string, systemPrompt?: string) => {
        samplerCalledWith = prompt;
        return 'Host AI LLM sampled compression: Preserved config port 8080 and secret key.';
      });

      const summary = await summarize([
        {
          id: 'c1',
          commit_id: 'com1',
          content: 'Configured server port 8080 with production secret key.',
          label: 'summarize',
        },
      ]);

      expect(summary).toBe('Host AI LLM sampled compression: Preserved config port 8080 and secret key.');
      expect(samplerCalledWith).toContain('Configured server port 8080');
    });
  });
});
