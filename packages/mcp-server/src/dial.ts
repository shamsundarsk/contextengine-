/**
 * Context Engine — Kiro Prompt Dial (command mode)
 *
 * Reads the latest context from the DB and outputs a compact status line.
 * Used by SessionStart command hooks to silently verify DB is accessible.
 *
 * Exit 0 = success (stdout forwarded to context)
 * Exit 0 with no output = no data yet, silent pass
 */

import { getAllSessions, getActiveBranch, getStats } from '@sham-sundar-senthil-kumar/context-engine-core';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });
dotenv.config();

function main() {
  try {
    const sessions = getAllSessions();
    const active = sessions.find((s) => s.commitCount > 0);
    if (!active) {
      process.exit(0);
    }

    const stats = getStats(active.sessionId);
    const branch = getActiveBranch(active.sessionId);

    // Compact one-liner status for hook context injection
    process.stdout.write(
      `[CE] ${active.sessionId}/${branch.name} · ${stats.totalCommits} commits · ${stats.tokensSavedPct}% saved · ${stats.keptVerbatimCount} kept refs\n`
    );
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
