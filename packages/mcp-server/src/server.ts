import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { registerSampler } from '@context-engine/core';
import { CONTEXT_ENGINE_INSTRUCTIONS } from './instructions.js';
import {
  handleBranch,
  handleCheckout,
  handleCommit,
  handleGatherContext,
  handleMerge,
  handleRecall,
  handleGetContextTree,
  handleOverrideMemoryNode,
  autoBranchOnContextShift,
  recordTurnAndAutoCommit,
} from './tools.js';

dotenv.config();

const serverDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Write system_prompt.md to package root on startup for transparent inspection
try {
  const rootDir = path.resolve(serverDir, '..');
  fs.writeFileSync(path.join(rootDir, 'system_prompt.md'), CONTEXT_ENGINE_INSTRUCTIONS, 'utf-8');
} catch {
  // Non-fatal
}

const server = new Server(
  {
    name: 'context-engine-mcp',
    version: '1.0.0',
    description: CONTEXT_ENGINE_INSTRUCTIONS,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const DEFAULT_SESSION = 'default_session';

// Wire host AI application's native MCP Sampling API to the core compression summarizer
registerSampler(async (prompt: string, systemPrompt?: string) => {
  try {
    const response = await server.createMessage({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt,
          },
        },
      ],
      systemPrompt:
        systemPrompt ||
        'You are an expert context compression assistant. Summarize technical context into 1-2 concise sentences while strictly preserving all concrete architectural decisions, schemas, ports, and configuration constants verbatim.',
      maxTokens: 300,
    });

    if (response.content.type === 'text') {
      return response.content.text.trim();
    }
    return null;
  } catch {
    // If client does not support sampling or user rejects, returns null for extractive fallback
    return null;
  }
});

// Hook into MCP session lifecycle initialization for auto-branching on directory shifts
server.oninitialized = async () => {
  try {
    const rootsResp = await server.listRoots().catch(() => null);
    if (rootsResp && rootsResp.roots && rootsResp.roots.length > 0) {
      const primaryRoot = rootsResp.roots[0].uri;
      autoBranchOnContextShift(DEFAULT_SESSION, primaryRoot);
    } else {
      autoBranchOnContextShift(DEFAULT_SESSION, process.cwd());
    }
  } catch {
    // Non-fatal
  }
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'gather_context',
        description:
          'MANDATORY ON NEW CHAT OR CONTEXT RESET: Reconstructs and retrieves bounded context memory (rolling summary and all preserved architectural facts) from previous sessions.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Optional session ID to gather context from. Defaults to active project session.',
            },
          },
        },
      },
      {
        name: 'get_context_tree',
        description:
          'Outputs a highly structured, clean markdown visual text graph tree of all active branches, commits, and memory states straight to the chat view.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Optional session ID to inspect memory tree for.',
            },
          },
        },
      },
      {
        name: 'override_memory_node',
        description:
          'Power user tool to target an exact node in the SQLite history graph and forcibly overwrite its text content, completely pruning out incorrect details or debug junk.',
        inputSchema: {
          type: 'object',
          properties: {
            commit_id: {
              type: 'string',
              description: 'The exact commit ID in the memory graph to overwrite',
            },
            new_summary: {
              type: 'string',
              description: 'New summary text replacing the original reason log',
            },
            new_topic: {
              type: 'string',
              description: 'Optional new topic title',
            },
            prune_transient: {
              type: 'boolean',
              description: 'If true, automatically deletes all transient logs and discarded chunks for this node (default: true)',
            },
            kept_chunks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional list of verified permanent facts to retain',
            },
            session_id: {
              type: 'string',
              description: 'Optional session ID',
            },
          },
          required: ['commit_id', 'new_summary'],
        },
      },
      {
        name: 'observe_turn',
        description:
          'Autonomous background observer: Records conversation turn history, runs dual-tier triage, and auto-commits compressed state every 5-10 turns.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Turn message text to observe and buffer',
            },
            role: {
              type: 'string',
              enum: ['user', 'assistant'],
              description: 'Role of the message sender',
            },
            workspace_path: {
              type: 'string',
              description: 'Optional workspace path to trigger auto-branching on directory shifts',
            },
            session_id: {
              type: 'string',
              description: 'Optional session ID',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'recall',
        description: 'Recall previous commits and context facts for a given query',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keyword or topic query to search context history' },
            scope: { type: 'string', enum: ['branch', 'all'], description: 'Search active branch or all branches' },
            session_id: { type: 'string', description: 'Optional session ID' },
          },
          required: ['query'],
        },
      },
      {
        name: 'commit',
        description: 'Record key architectural decision, bug fix, or findings into context graph',
        inputSchema: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Brief topic label' },
            summary: { type: 'string', description: 'Plain language explanation of the decision or finding' },
            kept_refs: {
              type: 'array',
              items: { type: 'string' },
              description: 'Critical code snippets or facts to keep verbatim',
            },
            session_id: { type: 'string', description: 'Optional session ID' },
          },
          required: ['topic', 'summary', 'kept_refs'],
        },
      },
      {
        name: 'branch',
        description:
          'Create a new branch or switch to an existing branch by name. If the branch already exists, it switches to it cleanly without modifying history.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the branch to create or switch to' },
            from_commit: { type: 'string', description: 'Optional starting commit ID for new branches only' },
            session_id: { type: 'string', description: 'Optional session ID' },
          },
          required: ['name'],
        },
      },
      {
        name: 'merge',
        description: 'Merge a feature context branch into target branch (defaults to main)',
        inputSchema: {
          type: 'object',
          properties: {
            source_branch: { type: 'string', description: 'Source branch name to merge from' },
            target_branch: { type: 'string', description: 'Target branch name to merge into (defaults to main)' },
            session_id: { type: 'string', description: 'Optional session ID' },
          },
          required: ['source_branch'],
        },
      },
      {
        name: 'checkout',
        description: 'Roll back context memory to a previous commit ID',
        inputSchema: {
          type: 'object',
          properties: {
            commit_id: { type: 'string', description: 'Target commit ID to checkout' },
            session_id: { type: 'string', description: 'Optional session ID' },
          },
          required: ['commit_id'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    const params = args || {};
    const sessionId = params.session_id ? String(params.session_id) : DEFAULT_SESSION;

    switch (name) {
      case 'gather_context':
        return await handleGatherContext(sessionId);

      case 'get_context_tree':
        return await handleGetContextTree(sessionId);

      case 'override_memory_node':
        return await handleOverrideMemoryNode(sessionId, String(params.commit_id || ''), {
          new_summary: String(params.new_summary || ''),
          new_topic: params.new_topic ? String(params.new_topic) : undefined,
          prune_transient: params.prune_transient !== false,
          kept_chunks: Array.isArray(params.kept_chunks) ? params.kept_chunks.map(String) : undefined,
          discard_chunk_ids: Array.isArray(params.discard_chunk_ids) ? params.discard_chunk_ids.map(String) : undefined,
        });

      case 'observe_turn': {
        const textContent = String(params.content || '');
        const role = String(params.role || 'user');
        if (params.workspace_path) {
          autoBranchOnContextShift(sessionId, String(params.workspace_path));
        }
        const autoRes = await recordTurnAndAutoCommit(sessionId, textContent, role);
        return {
          content: [
            {
              type: 'text',
              text: autoRes.committed
                ? `[Auto-Commit Worker] Turn ${autoRes.turnCount} observed. Asynchronous background milestone committed: ${autoRes.commitId}`
                : `[Auto-Commit Worker] Turn ${autoRes.turnCount} buffered for next milestone cycle.`,
            },
          ],
        };
      }

      case 'recall':
        return await handleRecall(sessionId, String(params.query || ''), params.scope as any);

      case 'commit':
        return await handleCommit(
          sessionId,
          String(params.topic || ''),
          String(params.summary || ''),
          Array.isArray(params.kept_refs) ? params.kept_refs.map(String) : []
        );

      case 'branch':
        return await handleBranch(sessionId, String(params.name || ''), params.from_commit ? String(params.from_commit) : undefined);

      case 'merge':
        return await handleMerge(
          sessionId,
          String(params.source_branch || ''),
          params.target_branch ? String(params.target_branch) : 'main'
        );

      case 'checkout':
        return await handleCheckout(sessionId, String(params.commit_id || ''));

      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool name: ${name}` }],
        };
    }
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Tool execution error: ${err.message}` }],
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Start stdio transport cleanly
runServer().catch((error) => {
  console.error('[MCP Server Fatal Error]:', error);
  process.exit(1);
});
