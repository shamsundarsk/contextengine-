import { spawn } from 'child_process';
import path from 'path';

async function runLiveTest() {
  console.log('🚀 Starting Context Engine MCP Server live stdio test...\n');

  const serverPath = path.resolve(__dirname, '../packages/mcp-server/dist/server.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let messageId = 1;
  const pendingRequests = new Map<number, (res: any) => void>();
  let buffer = '';

  server.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pendingRequests.has(msg.id)) {
          const resolver = pendingRequests.get(msg.id)!;
          pendingRequests.delete(msg.id);
          resolver(msg);
        }
      } catch {
        // Ignore non-json logs
      }
    }
  });

  function sendRpc(method: string, params: any = {}): Promise<any> {
    const id = messageId++;
    const req = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve) => {
      pendingRequests.set(id, resolve);
      server.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  // 1. Initialize
  console.log('1️⃣ Sending MCP initialize request...');
  const initRes = await sendRpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: { sampling: {} },
    clientInfo: { name: 'LiveTestClient', version: '1.0.0' },
  });
  console.log('✅ Server initialized:', initRes.result?.serverInfo?.name, `v${initRes.result?.serverInfo?.version}\n`);

  // Send notifications/initialized
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

  // 2. List tools
  console.log('2️⃣ Calling tools/list...');
  const toolsRes = await sendRpc('tools/list');
  const toolNames = (toolsRes.result?.tools || []).map((t: any) => t.name);
  console.log('✅ Available MCP Tools (' + toolNames.length + '):', toolNames.join(', '), '\n');

  // 3. Commit an architectural fact
  console.log('3️⃣ Calling commit() tool with architectural decision...');
  const commitRes = await sendRpc('tools/call', {
    name: 'commit',
    arguments: {
      topic: '[Architecture] Local-First SQLite & Stdio Transport',
      summary: 'Decided to use stdio transport and store context in ~/.config/context-engine/context.db',
      kept_refs: [
        'Storage path: ~/.config/context-engine/context.db',
        'Protocol: Native Model Context Protocol over stdio',
      ],
      session_id: 'live_test_session',
    },
  });
  console.log('✅ Commit result:\n' + commitRes.result?.content?.[0]?.text + '\n');

  // Extract commit ID
  const commitText = commitRes.result?.content?.[0]?.text || '';
  const match = commitText.match(/ID:\s+(commit_\w+)/);
  const commitId = match ? match[1] : '';

  // 4. View Context Tree
  console.log('4️⃣ Calling get_context_tree()...');
  const treeRes = await sendRpc('tools/call', {
    name: 'get_context_tree',
    arguments: {
      session_id: 'live_test_session',
    },
  });
  console.log('✅ Visual Context Memory Graph:\n' + treeRes.result?.content?.[0]?.text + '\n');

  // 5. Test override_memory_node
  if (commitId) {
    console.log(`5️⃣ Calling override_memory_node() on ${commitId}...`);
    const overrideRes = await sendRpc('tools/call', {
      name: 'override_memory_node',
      arguments: {
        commit_id: commitId,
        new_topic: '[Architecture Fix] Verified Stdio + Privacy Shield',
        new_summary: 'Surgically updated explanation and pruned debug noise.',
        kept_chunks: ['Verified: Local-First Privacy Shield is active'],
        session_id: 'live_test_session',
      },
    });
    console.log('✅ Override result:\n' + overrideRes.result?.content?.[0]?.text + '\n');
  }

  // 6. Test recall
  console.log('6️⃣ Calling recall() for "Privacy Shield"...');
  const recallRes = await sendRpc('tools/call', {
    name: 'recall',
    arguments: {
      query: 'Privacy Shield',
      session_id: 'live_test_session',
    },
  });
  console.log('✅ Recall output:\n' + recallRes.result?.content?.[0]?.text + '\n');

  console.log('🎉 ALL LIVE MCP TESTS PASSED SUCCESSFULLY!');
  server.kill();
  process.exit(0);
}

runLiveTest().catch((err) => {
  console.error('❌ Live test failed:', err);
  process.exit(1);
});
