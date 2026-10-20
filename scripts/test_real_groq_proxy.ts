import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { scoreChunk, commit, reconstructContext, countTokens } from '@context-engine/core';

dotenv.config();

interface TurnFixture {
  turn: number;
  role: string;
  content: string;
  isRecall?: boolean;
}

interface QuestionEvaluation {
  qNum: number;
  turn: number;
  question: string;
  expectedFactDesc: string;
  expectedSubstrings: string[];
  directLatencyMs: number;
  proxyLatencyMs: number;
  directAnswer: string;
  proxyAnswer: string;
  pass: boolean;
}

async function fetchWithRetry(url: string, options: any, maxRetries = 5): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status === 429) {
      const errText = await resp.text();
      console.warn(`[Groq Rate Limit (429) on attempt ${attempt}/${maxRetries}]: ${errText.slice(0, 120)}... Waiting 8s for TPM reset...`);
      await new Promise((r) => setTimeout(r, 8000));
      continue;
    }
    return resp;
  }
  return await fetch(url, options);
}

async function runGroqBenchmark() {
  const rootDir = process.cwd();
  const fixturePath = path.join(rootDir, 'scripts/fixtures/conversation_realistic.json');
  const conversation: TurnFixture[] = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  const apiKey = process.env.OPENAI_API_KEY || '';
  const modelName = 'openai/gpt-oss-20b';

  console.log(`\n=======================================================`);
  console.log(`=== REAL GROQ BENCHMARK EVALUATION (Port 4000 Proxy) ===`);
  console.log(`=======================================================\n`);
  console.log(`Target Downstream Model: ${modelName}`);
  console.log(`Proxy URL: http://127.0.0.1:4000/v1/chat/completions`);
  console.log(`Direct Groq URL: https://api.groq.com/openai/v1/chat/completions\n`);

  const sessionId = `clean_run_${Date.now()}`;
  const directMessages: { role: string; content: string }[] = [];
  const evalResults: QuestionEvaluation[] = [];

  let directTotalInputTokens = 0;
  let proxyTotalInputTokens = 0;

  for (const turn of conversation) {
    directMessages.push({ role: turn.role, content: turn.content });

    const rawHistoryText = directMessages.map((m) => `${m.role}: ${m.content}`).join('\n');
    const turnDirectTokens = countTokens(rawHistoryText, 'gpt-4o-mini');
    directTotalInputTokens += turnDirectTokens;

    // Triage and commit turn into Context Engine memory store via core logic
    const recency = turn.turn / conversation.length;
    const scoreRes = await scoreChunk(turn.content, {
      recencyNormalized: recency,
      contextText: rawHistoryText,
    });

    commit(
      sessionId,
      'main',
      `Turn ${turn.turn}`,
      scoreRes.reason,
      [{ content: turn.content, label: scoreRes.label }]
    );

    const reconstructed = await reconstructContext(sessionId);
    proxyTotalInputTokens += reconstructed.reconstructedTokenCount;

    if (turn.isRecall) {
      const questionsToAsk: { qNum: number; qText: string; factDesc: string; subs: string[] }[] = [];

      if (turn.turn === 10) {
        questionsToAsk.push({
          qNum: 1,
          qText: 'Answer concisely: What database engine, embedding model, and proxy port did we select?',
          factDesc: 'Database Engine (SQLite), Embedding Model (Xenova/all-MiniLM-L6-v2), Proxy Port (4000)',
          subs: ['sqlite', 'xenova', '4000'],
        });
      } else if (turn.turn === 20) {
        questionsToAsk.push({
          qNum: 2,
          qText: 'Answer concisely: What is the session resolution priority order?',
          factDesc: 'Session Priority Order (header > metadata > query > hash_fallback)',
          subs: ['header', 'metadata', 'query', 'fallback'],
        });
        questionsToAsk.push({
          qNum: 3,
          qText: 'Answer concisely: How does manual override history work?',
          factDesc: 'Manual Override Behavior (append new commit with override reason_log)',
          subs: ['commit', 'override'],
        });
      } else if (turn.turn === 30) {
        questionsToAsk.push({
          qNum: 4,
          qText: 'Answer concisely: List the 5 MCP tools.',
          factDesc: '5 MCP Tools (recall, commit, branch, merge, checkout)',
          subs: ['recall', 'commit', 'branch', 'merge', 'checkout'],
        });
        questionsToAsk.push({
          qNum: 5,
          qText: 'Answer concisely: Explain how shadow mode functions.',
          factDesc: 'Shadow Mode (logs token savings, forwards original payload)',
          subs: ['shadow', 'token'],
        });
      }

      for (const q of questionsToAsk) {
        console.log(`Asking Recall Question ${q.qNum} (Turn ${turn.turn})...`);
        await new Promise((r) => setTimeout(r, 2000));

        // 1. Direct Condition (Bypassing proxy straight to Groq)
        const dStart = performance.now();
        const directHttpResp = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: 'Answer the question based strictly on the provided conversation context history.' },
              { role: 'user', content: `${rawHistoryText}\n\nQuestion: ${q.qText}` },
            ],
            temperature: 0.1,
            max_tokens: 1000,
          }),
        });

        if (!directHttpResp.ok) {
          const errText = await directHttpResp.text();
          console.error(`Direct Groq API call failed:`, errText);
          process.exit(1);
        }

        const dLatency = Math.round(performance.now() - dStart);
        const dJson = await directHttpResp.json();
        const dAnswer = dJson.choices?.[0]?.message?.content?.trim() || '(No response)';

        await new Promise((r) => setTimeout(r, 2500));

        // 2. Proxy Condition (Via Context Engine Proxy on port 4000)
        const pStart = performance.now();
        const proxyHttpResp = await fetchWithRetry('http://127.0.0.1:4000/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'x-session-id': sessionId,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content: q.qText }],
            temperature: 0.1,
            max_tokens: 1000,
          }),
        });

        if (!proxyHttpResp.ok) {
          const errText = await proxyHttpResp.text();
          console.error(`Proxy HTTP call failed:`, errText);
          process.exit(1);
        }

        const pLatency = Math.round(performance.now() - pStart);
        const pJson = await proxyHttpResp.json();
        const pAnswer = pJson.choices?.[0]?.message?.content?.trim() || '(No response)';

        const pNormalized = pAnswer.toLowerCase().replace(/[\u202f\u00a0_]/g, ' ');
        const pass = q.subs.every((sub) => {
          const subNormalized = sub.toLowerCase().replace(/[\u202f\u00a0_]/g, ' ');
          return pNormalized.includes(subNormalized);
        });

        evalResults.push({
          qNum: q.qNum,
          turn: turn.turn,
          question: q.qText,
          expectedFactDesc: q.factDesc,
          expectedSubstrings: q.subs,
          directLatencyMs: dLatency,
          proxyLatencyMs: pLatency,
          directAnswer: dAnswer,
          proxyAnswer: pAnswer,
          pass,
        });

        console.log(`- Direct Call Latency: ${dLatency} ms`);
        console.log(`- Proxy Call Latency:  ${pLatency} ms`);
        console.log(`- Pass Status:         ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
        console.log(`- Direct Answer:\n  "${dAnswer}"`);
        console.log(`- Proxy Answer:\n  "${pAnswer}"\n`);
      }
    }
  }

  const tokensSaved = directTotalInputTokens - proxyTotalInputTokens;
  const tokensSavedPct = Math.round((tokensSaved / directTotalInputTokens) * 100);
  const passedCount = evalResults.filter((r) => r.pass).length;

  console.log(`=======================================================`);
  console.log(`=== GROQ BENCHMARK RESULTS SUMMARY ===`);
  console.log(`=======================================================\n`);
  console.log(`- Model Evaluated: ${modelName}`);
  console.log(`- Total Direct Input Tokens: ${directTotalInputTokens.toLocaleString()}`);
  console.log(`- Total Proxy Input Tokens:  ${proxyTotalInputTokens.toLocaleString()}`);
  console.log(`- Token Savings:             ${tokensSaved.toLocaleString()} tokens (${tokensSavedPct}%)`);
  console.log(`- Fact Retention Pass Rate:  ${passedCount}/${evalResults.length} (${Math.round((passedCount / evalResults.length) * 100)}%)`);

  // Save detailed run output to JSON
  const outputJsonPath = path.join(rootDir, 'groq_live_eval_results.json');
  fs.writeFileSync(
    outputJsonPath,
    JSON.stringify(
      {
        modelName,
        directTotalInputTokens,
        proxyTotalInputTokens,
        tokensSaved,
        tokensSavedPct,
        factRetention: `${passedCount}/${evalResults.length}`,
        results: evalResults,
      },
      null,
      2
    ),
    'utf-8'
  );
  console.log(`\nSaved Groq live evaluation results to: ${outputJsonPath}\n`);
}

runGroqBenchmark().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
