import fs from 'fs';
import path from 'path';
import { scoreChunk } from '@context-engine/core';

interface TurnFixture {
  turn: number;
  role: string;
  content: string;
  isRecall?: boolean;
}

async function diagnose() {
  const rootDir = process.cwd();
  const fixturePath = path.join(rootDir, 'scripts/fixtures/conversation.json');
  const conversation: TurnFixture[] = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  console.log('| Turn | Recency | Ref Freq | Specificity | Topic Match | Final Score | Label | Content Snippet |');
  console.log('| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |');

  const historyStr: string[] = [];

  for (const turn of conversation) {
    historyStr.push(`${turn.role}: ${turn.content}`);

    const res = await scoreChunk(turn.content, {
      recencyNormalized: turn.turn / 30,
      contextText: historyStr.join('\n'),
    });

    const sub = res.subScores;
    const contentTrunc = turn.content.length > 55 ? turn.content.slice(0, 52) + '...' : turn.content;

    console.log(
      `| ${turn.turn} | ${sub.recency.toFixed(2)} | ${sub.referenceFrequency.toFixed(2)} | ${sub.specificity.toFixed(
        2
      )} | ${sub.topicMatch.toFixed(2)} | ${res.score.toFixed(2)} | **${res.label}** | ${contentTrunc} |`
    );
  }
}

diagnose().catch(console.error);
