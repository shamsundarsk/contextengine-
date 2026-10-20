import fs from 'fs';
import path from 'path';
import { countTokens, scoreChunk, commit, reconstructContext, getDatabase, setDatabase } from '@context-engine/core';
import Database from 'better-sqlite3';

interface PricingConfig {
  inputPer1k: number;
  outputPer1k: number;
}

interface TurnFixture {
  turn: number;
  role: string;
  content: string;
  isRecall?: boolean;
}

interface RunStats {
  turnLatencies: number[];
  inputTokensPerTurn: number[];
  totalInputTokens: number;
  totalCostUSD: number;
  recallAnswers: { turn: number; question: string; contextProvidedSnippet: string }[];
}

async function runEvaluation() {
  console.log('=== Context Engine Benchmark Evaluation ===\n');

  const rootDir = process.cwd();
  const pricingPath = path.join(rootDir, 'scripts/config/pricing.json');
  const fixturePath = path.join(rootDir, 'scripts/fixtures/conversation.json');

  const pricingData = JSON.parse(fs.readFileSync(pricingPath, 'utf-8'));
  const conversation: TurnFixture[] = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  const modelName = process.env.SUMMARIZER_MODEL || 'gpt-4o-mini';
  const pricing: PricingConfig = pricingData[modelName] || pricingData['default'];

  // Setup isolated in-memory DB for evaluation run
  const db = new Database(':memory:');
  setDatabase(db);

  const sessionId = 'eval_30_turn_session';

  // 1. Direct Run (Raw Context Accumulation)
  const directStats: RunStats = {
    turnLatencies: [],
    inputTokensPerTurn: [],
    totalInputTokens: 0,
    totalCostUSD: 0,
    recallAnswers: [],
  };

  const accumulatedRawMessages: string[] = [];

  for (const turn of conversation) {
    const start = performance.now();
    accumulatedRawMessages.push(`${turn.role}: ${turn.content}`);
    const fullText = accumulatedRawMessages.join('\n');
    const tok = countTokens(fullText, modelName);
    const latency = performance.now() - start;

    directStats.inputTokensPerTurn.push(tok);
    directStats.totalInputTokens += tok;
    directStats.turnLatencies.push(Number(latency.toFixed(2)));

    if (turn.isRecall) {
      directStats.recallAnswers.push({
        turn: turn.turn,
        question: turn.content,
        contextProvidedSnippet: fullText.slice(-300),
      });
    }
  }

  // 2. Proxy / Context Engine Run (Triaged + Bounded Context Window)
  const proxyStats: RunStats = {
    turnLatencies: [],
    inputTokensPerTurn: [],
    totalInputTokens: 0,
    totalCostUSD: 0,
    recallAnswers: [],
  };

  const proxyHistoryStr: string[] = [];

  for (const turn of conversation) {
    const start = performance.now();
    proxyHistoryStr.push(`${turn.role}: ${turn.content}`);

    const scoreRes = await scoreChunk(turn.content, {
      recencyNormalized: turn.turn / 30,
      contextText: proxyHistoryStr.join('\n'),
    });

    commit(
      sessionId,
      'main',
      `Turn ${turn.turn}`,
      scoreRes.reason,
      [{ content: turn.content, label: scoreRes.label }]
    );

    const reconstructed = await reconstructContext(sessionId);
    const tok = reconstructed.reconstructedTokenCount;
    const latency = performance.now() - start;

    proxyStats.inputTokensPerTurn.push(tok);
    proxyStats.totalInputTokens += tok;
    proxyStats.turnLatencies.push(Number(latency.toFixed(2)));

    if (turn.isRecall) {
      const pContext = reconstructed.fullPromptText;
      let statusNote = '';
      if (turn.turn === 10) {
        const pass = pContext.includes('SQLite') && pContext.includes('Xenova/all-MiniLM-L6-v2') && pContext.includes('4000');
        statusNote = pass ? 'PASS (Retained SQLite, Xenova/all-MiniLM-L6-v2, Port 4000)' : 'FAIL (Missing facts)';
      } else if (turn.turn === 20) {
        const pass = pContext.includes('header > metadata > query > hash_fallback') && pContext.includes('append a new commit');
        statusNote = pass ? 'PASS (Retained priority order & manual override append)' : 'FAIL (Missing facts)';
      } else if (turn.turn === 30) {
        const pass = pContext.includes('recall, commit, branch, merge, checkout') && pContext.includes('Shadow mode');
        statusNote = pass ? 'PASS (Retained 5 MCP tools & shadow mode behavior)' : 'FAIL (Missing facts)';
      }

      proxyStats.recallAnswers.push({
        turn: turn.turn,
        question: turn.content,
        retentionStatus: statusNote,
        contextProvidedSnippet: reconstructed.fullPromptText.slice(-300) || '(empty)',
      });
    }
  }

  // Cost calculation
  directStats.totalCostUSD = Number(((directStats.totalInputTokens / 1000) * pricing.inputPer1k).toFixed(6));
  proxyStats.totalCostUSD = Number(((proxyStats.totalInputTokens / 1000) * pricing.inputPer1k).toFixed(6));

  const tokensSaved = directStats.totalInputTokens - proxyStats.totalInputTokens;
  const tokensSavedPct = Math.round((tokensSaved / directStats.totalInputTokens) * 100);
  const costSavedUSD = Number((directStats.totalCostUSD - proxyStats.totalCostUSD).toFixed(6));

  const avgDirectLatency = (
    directStats.turnLatencies.reduce((a, b) => a + b, 0) / conversation.length
  ).toFixed(2);
  const avgProxyLatency = (
    proxyStats.turnLatencies.reduce((a, b) => a + b, 0) / conversation.length
  ).toFixed(2);

  const recallNotesText = proxyStats.recallAnswers
    .map((r: any) => `- **Turn ${r.turn} (${r.question})**: ${r.retentionStatus}`)
    .join('\n');

  // Markdown Results Table
  const markdownTable = `
# Context Engine Evaluation Results (30-Turn Benchmark)

> **[BENCHMARK NOTICE / OFFLINE RUN]**: No live API key was set in \`.env\` (\`OPENAI_API_KEY\` / \`ANTHROPIC_API_KEY\`).
> The latency reported below reflects local in-process token accounting and context reconstruction time (${avgProxyLatency} ms), NOT live upstream LLM network API inference time (which adds 500–3000 ms per call).

Model Evaluated: \`${modelName}\`

| Metric | Direct Provider (Raw Context) | Proxy (Context Engine) | Savings / Improvement |
| :--- | :---: | :---: | :---: |
| **Total Input Tokens** | ${directStats.totalInputTokens.toLocaleString()} | ${proxyStats.totalInputTokens.toLocaleString()} | **${tokensSaved.toLocaleString()} tokens (${tokensSavedPct}%)** |
| **Total Input Cost (USD)** | $${directStats.totalCostUSD.toFixed(6)} | $${proxyStats.totalCostUSD.toFixed(6)} | **+$${costSavedUSD.toFixed(6)}** |
| **Avg Turn Latency (ms)** | ${avgDirectLatency} ms (Local JS) | ${avgProxyLatency} ms (Local Core Overhead) | Overhead: +${(Number(avgProxyLatency) - Number(avgDirectLatency)).toFixed(2)} ms |

## Fact Retention Audit Notes (eval_answers.json)

${recallNotesText}
`;

  console.log(markdownTable);

  // Output JSON File
  const jsonResult = {
    timestamp: new Date().toISOString(),
    modelName,
    pricing,
    summary: {
      directTotalInputTokens: directStats.totalInputTokens,
      proxyTotalInputTokens: proxyStats.totalInputTokens,
      tokensSaved,
      tokensSavedPct,
      directTotalCostUSD: directStats.totalCostUSD,
      proxyTotalCostUSD: proxyStats.totalCostUSD,
      costSavedUSD,
      avgDirectLatencyMs: Number(avgDirectLatency),
      avgProxyLatencyMs: Number(avgProxyLatency),
    },
    directStats,
    proxyStats,
  };

  const outputPath = path.join(rootDir, 'eval_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(jsonResult, null, 2), 'utf-8');
  console.log(`Saved detailed evaluation JSON to: ${outputPath}`);
}

runEvaluation().catch((err) => {
  console.error('Evaluation execution failed:', err);
  process.exit(1);
});
