import { handleCommit, handleRecall } from '../packages/mcp-server/src/tools.js';

async function testMcpToolCalls() {
  console.log('=======================================================');
  console.log('=== MCP SERVER TOOL EXECUTION TRANSCRIPT TEST ===');
  console.log('=======================================================\n');

  const sessionId = 'mcp_transcript_session';

  // 1. Execute commit tool call
  console.log('[MCP Tool Call 1]: commit(...)');
  const commitResult = await handleCommit(
    sessionId,
    'Architecture',
    'Database engine is SQLite via better-sqlite3',
    ['SQLite', 'better-sqlite3']
  );
  console.log('Commit Result:\n', JSON.stringify(commitResult, null, 2), '\n');

  // 2. Execute recall tool call
  console.log('[MCP Tool Call 2]: recall(query: "database")');
  const recallResult = await handleRecall(sessionId, 'database');
  console.log('Recall Result Transcript:\n', JSON.stringify(recallResult, null, 2), '\n');
}

testMcpToolCalls();
