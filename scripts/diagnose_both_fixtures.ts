import fs from 'fs';
import path from 'path';
import { scoreChunk } from '@context-engine/core';

interface TurnFixture {
  turn: number;
  role: string;
  content: string;
  isRecall?: boolean;
}

async function analyzeFixture(fixtureName: string, fileName: string) {
  const rootDir = process.cwd();
  const fixturePath = path.join(rootDir, 'scripts/fixtures', fileName);
  const conversation: TurnFixture[] = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  console.log(`\n=======================================================`);
  console.log(`=== DIAGNOSIS & LABEL DISTRIBUTION: ${fixtureName.toUpperCase()} ===`);
  console.log(`=======================================================\n`);

  console.log('| Turn | Recency | Ref Freq | Specificity | Topic Match | Final Score | Label | Content Snippet |');
  console.log('| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |');

  const historyStr: string[] = [];
  const counts = { keep_verbatim: 0, summarize: 0, discard: 0 };

  for (const turn of conversation) {
    historyStr.push(`${turn.role}: ${turn.content}`);

    const res = await scoreChunk(turn.content, {
      recencyNormalized: turn.turn / conversation.length,
      contextText: historyStr.join('\n'),
    });

    counts[res.label as keyof typeof counts]++;

    const sub = res.subScores;
    const contentTrunc = turn.content.length > 55 ? turn.content.slice(0, 52) + '...' : turn.content;

    console.log(
      `| ${turn.turn} | ${sub.recency.toFixed(2)} | ${sub.referenceFrequency.toFixed(2)} | ${sub.specificity.toFixed(
        2
      )} | ${sub.topicMatch.toFixed(2)} | ${res.score.toFixed(2)} | **${res.label}** | ${contentTrunc} |`
    );
  }

  const total = conversation.length;
  console.log(`\n--- LABEL DISTRIBUTION SUMMARY (${fixtureName}) ---`);
  console.log(`Total Turns: ${total}`);
  console.log(`- keep_verbatim: ${counts.keep_verbatim} (${Math.round((counts.keep_verbatim / total) * 100)}%)`);
  console.log(`- summarize:     ${counts.summarize} (${Math.round((counts.summarize / total) * 100)}%)`);
  console.log(`- discard:       ${counts.discard} (${Math.round((counts.discard / total) * 100)}%)`);

  return counts;
}

async function run() {
  await analyzeFixture('Dense Fixture (conversation.json)', 'conversation.json');
  await analyzeFixture('Realistic Fixture (conversation_realistic.json)', 'conversation_realistic.json');
}

run().catch(console.error);
