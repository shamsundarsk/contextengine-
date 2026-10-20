import fs from 'fs';
import path from 'path';
import { scoreChunk, commit, reconstructContext, setDatabase, countTokens } from '@context-engine/core';
import Database from 'better-sqlite3';

interface TurnFixture {
  turn: number;
  role: string;
  content: string;
  isRecall?: boolean;
}

async function evaluateFixture(fixtureTitle: string, fileName: string) {
  const rootDir = process.cwd();
  const fixturePath = path.join(rootDir, 'scripts/fixtures', fileName);
  const conversation: TurnFixture[] = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  const db = new Database(':memory:');
  setDatabase(db);
  const sessionId = `eval_session_${fileName.replace('.json', '')}`;

  let rawContextAcc = '';
  let directTotalTokens = 0;
  let proxyTotalTokens = 0;

  const shadowDeltas: { turn: number; originalTokens: number; boundedTokens: number; delta: number }[] = [];
  const recallResults: { questionNum: number; turn: number; question: string; pass: boolean; note: string }[] = [];

  for (const turn of conversation) {
    rawContextAcc += (rawContextAcc ? '\n' : '') + `${turn.role}: ${turn.content}`;
    const originalTokens = countTokens(rawContextAcc, 'gpt-4o-mini');
    directTotalTokens += originalTokens;

    const scoreRes = await scoreChunk(turn.content, {
      recencyNormalized: turn.turn / conversation.length,
      contextText: rawContextAcc,
    });

    commit(
      sessionId,
      'main',
      `Turn ${turn.turn}`,
      scoreRes.reason,
      [{ content: turn.content, label: scoreRes.label }]
    );

    const reconstructed = await reconstructContext(sessionId);
    const boundedTokens = reconstructed.reconstructedTokenCount;
    proxyTotalTokens += boundedTokens;

    const delta = originalTokens - boundedTokens; // signed delta: original - bounded
    shadowDeltas.push({
      turn: turn.turn,
      originalTokens,
      boundedTokens,
      delta,
    });

    if (turn.isRecall) {
      const pContext = reconstructed.fullPromptText;
      if (turn.turn === 10) {
        const pass = pContext.includes('SQLite') && pContext.includes('Xenova/all-MiniLM-L6-v2') && pContext.includes('4000');
        recallResults.push({
          questionNum: 1,
          turn: 10,
          question: 'Question 1 (DB engine, embedding model, proxy port)',
          pass,
          note: pass ? 'PASS (Retained SQLite, Xenova/all-MiniLM-L6-v2, Port 4000)' : 'FAIL (Missing facts)',
        });
      } else if (turn.turn === 20) {
        const passPrio = pContext.includes('header > metadata > query > hash_fallback');
        const passOverride = pContext.includes('append a new commit');
        recallResults.push({
          questionNum: 2,
          turn: 20,
          question: 'Question 2 (Session resolution priority order)',
          pass: passPrio,
          note: passPrio ? 'PASS (Retained header > metadata > query > hash_fallback)' : 'FAIL (Missing priority order)',
        });
        recallResults.push({
          questionNum: 3,
          turn: 20,
          question: 'Question 3 (Manual override commit history)',
          pass: passOverride,
          note: passOverride ? 'PASS (Retained manual override append behavior)' : 'FAIL (Missing override behavior)',
        });
      } else if (turn.turn === 30) {
        const passTools = pContext.includes('recall, commit, branch, merge, checkout');
        const passShadow = pContext.includes('Shadow mode');
        recallResults.push({
          questionNum: 4,
          turn: 30,
          question: 'Question 4 (5 MCP tool names)',
          pass: passTools,
          note: passTools ? 'PASS (Retained recall, commit, branch, merge, checkout)' : 'FAIL (Missing MCP tools)',
        });
        recallResults.push({
          questionNum: 5,
          turn: 30,
          question: 'Question 5 (Shadow mode function)',
          pass: passShadow,
          note: passShadow ? 'PASS (Retained shadow mode token saving behavior)' : 'FAIL (Missing shadow mode)',
        });
      }
    }
  }

  const tokensSaved = directTotalTokens - proxyTotalTokens;
  const tokensSavedPct = Math.round((tokensSaved / directTotalTokens) * 100);
  const passedCount = recallResults.filter((r) => r.pass).length;

  return {
    fixtureTitle,
    fileName,
    directTotalTokens,
    proxyTotalTokens,
    tokensSaved,
    tokensSavedPct,
    shadowDeltas,
    recallResults,
    passedCount,
    totalQuestions: recallResults.length,
  };
}

async function main() {
  const denseRes = await evaluateFixture('Dense Fixture (conversation.json)', 'conversation.json');
  const realisticRes = await evaluateFixture('Realistic Fixture (conversation_realistic.json)', 'conversation_realistic.json');

  console.log(`\n=======================================================`);
  console.log(`=== EVALUATION COMPARISON SUMMARY ===`);
  console.log(`=======================================================\n`);

  console.log(`DENSE FIXTURE (conversation.json):`);
  console.log(`- Total Direct Tokens: ${denseRes.directTotalTokens}`);
  console.log(`- Total Proxy Tokens:  ${denseRes.proxyTotalTokens}`);
  console.log(`- Token Savings:       ${denseRes.tokensSaved} tokens (${denseRes.tokensSavedPct}%)`);
  console.log(`- Fact Retention:      ${denseRes.passedCount}/${denseRes.totalQuestions}`);

  console.log(`\nREALISTIC FIXTURE (conversation_realistic.json):`);
  console.log(`- Total Direct Tokens: ${realisticRes.directTotalTokens}`);
  console.log(`- Total Proxy Tokens:  ${realisticRes.proxyTotalTokens}`);
  console.log(`- Token Savings:       ${realisticRes.tokensSaved} tokens (${realisticRes.tokensSavedPct}%)`);
  console.log(`- Fact Retention:      ${realisticRes.passedCount}/${realisticRes.totalQuestions}`);

  console.log(`\n--- PER-TURN SHADOW MODE DELTA LOG (REALISTIC FIXTURE) ---`);
  console.log('| Turn | Raw Tokens (Original) | Proxy Tokens (Bounded) | Signed Delta (Original - Bounded) |');
  console.log('| :---: | :---: | :---: | :---: |');
  for (const s of realisticRes.shadowDeltas) {
    console.log(`| ${s.turn} | ${s.originalTokens} | ${s.boundedTokens} | ${s.delta >= 0 ? '+' : ''}${s.delta} tokens |`);
  }

  console.log(`\n--- FACT RETENTION AUDIT PER QUESTION (REALISTIC FIXTURE) ---`);
  for (const r of realisticRes.recallResults) {
    console.log(`- Question ${r.questionNum} (Turn ${r.turn}): ${r.note}`);
  }

  // Save realistic answers to eval_answers_realistic.json
  const answersPath = path.join(process.cwd(), 'eval_answers_realistic.json');
  fs.writeFileSync(answersPath, JSON.stringify(realisticRes, null, 2), 'utf-8');
  console.log(`\nSaved realistic benchmark evaluation output to: ${answersPath}`);
}

main().catch(console.error);
