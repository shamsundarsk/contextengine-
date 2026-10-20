import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { CONTEXT_ENGINE_INSTRUCTIONS } from './instructions.js';
import { handleBranch, handleCheckout, handleCommit, handleGatherContext, handleMerge, handleRecall } from './tools.js';

dotenv.config();

// Write system_prompt.md to package root on startup
try {
  const rootDir = path.resolve(__dirname, '..');
  fs.writeFileSync(path.join(rootDir, 'system_prompt.md'), CONTEXT_ENGINE_INSTRUCTIONS, 'utf-8');
} catch (err) {
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

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'gather_context',
        description:
          'MANDATORY ON NEW CHAT OR CONTEXT RESET: Reconstructs and retrieves the full bounded context memory (rolling summary and all preserved architectural facts) from previous chats.',
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
        name: 'recall',
        description: 'Recall previous commits and context facts for a given query',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keyword or topic query to search context history' },
            scope: { type: 'string', enum: ['branch', 'all'], description: 'Search active branch or all branches' },
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
          },
          required: ['topic', 'summary', 'kept_refs'],
        },
      },
      {
        name: 'branch',
        description: 'Create a new branch or switch to an existing branch by name. If the branch already exists, it simply switches to it without modifying its history.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the branch to create or switch to' },
            from_commit: { type: 'string', description: 'Optional starting commit ID for new branches only' },
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

runServer().catch((error) => {
  console.error('[MCP Server Fatal Error]:', error);
  process.exit(1);
});
