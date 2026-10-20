import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { getSessionData, executeCheckout, executeBranch, executeStatus, executeLog, executeBranches, executeSessions } from './api.js';
import { StatsBar } from './components/StatsBar.js';
import { BranchList } from './components/BranchList.js';
import { CommitLog } from './components/CommitLog.js';

import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

interface WatchViewProps {
  sessionId: string;
}

const WatchView: React.FC<WatchViewProps> = ({ sessionId }) => {
  const [data, setData] = useState(() => getSessionData(sessionId));
  const { exit } = useApp();

  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const nextData = getSessionData(sessionId);
        setData(nextData);
      } catch (err) {
        // Non-fatal
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [sessionId]);

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <StatsBar stats={data.stats} />
      <Box flexDirection="row" marginTop={1} gap={1}>
        <BranchList branches={data.branches} activeBranch={data.stats.activeBranch} />
        <CommitLog commits={data.commits} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Ctrl+C to exit watch mode. Refreshing every 1.5s.</Text>
      </Box>
    </Box>
  );
};

const program = new Command();

program
  .name('context-engine')
  .description('Context Engine CLI & Watcher Tool')
  .version('1.0.0');

program
  .command('watch')
  .description('Live interactive terminal UI watching context graph & session metrics')
  .option('-s, --session <id>', 'Session ID to watch', 'default_session')
  .action((options) => {
    const sessionId = options.session || 'default_session';
    render(<WatchView sessionId={sessionId} />);
  });

program
  .command('checkout <commitId>')
  .description('Checkout a specific commit ID')
  .option('-s, --session <id>', 'Session ID', 'default_session')
  .action((commitId, options) => {
    const sessionId = options.session || 'default_session';
    try {
      executeCheckout(sessionId, commitId);
      console.log(`Successfully checked out commit '${commitId}' for session '${sessionId}'.`);
    } catch (err: any) {
      console.error(`Checkout failed: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('branch <name>')
  .description('Create or switch to a branch')
  .option('-s, --session <id>', 'Session ID', 'default_session')
  .action((name, options) => {
    const sessionId = options.session || 'default_session';
    try {
      executeBranch(sessionId, name);
      console.log(`Successfully created / switched to branch '${name}' for session '${sessionId}'.`);
    } catch (err: any) {
      console.error(`Branch failed: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current session status — active branch, head commit, token stats')
  .option('-s, --session <id>', 'Session ID', 'default_session')
  .action((options) => {
    const sessionId = options.session || 'default_session';
    try {
      executeStatus(sessionId);
    } catch (err: any) {
      console.error(`Status failed: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('log')
  .description('Print the commit log for the active (or specified) branch')
  .option('-s, --session <id>', 'Session ID', 'default_session')
  .option('-b, --branch <name>', 'Branch name (defaults to active branch)')
  .option('-n, --limit <n>', 'Max number of commits to show', '20')
  .action((options) => {
    const sessionId = options.session || 'default_session';
    const branchName = options.branch;
    const limit = parseInt(options.limit, 10) || 20;
    try {
      executeLog(sessionId, branchName, limit);
    } catch (err: any) {
      console.error(`Log failed: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('branches')
  .description('List all branches for a session')
  .option('-s, --session <id>', 'Session ID', 'default_session')
  .action((options) => {
    const sessionId = options.session || 'default_session';
    try {
      executeBranches(sessionId);
    } catch (err: any) {
      console.error(`Branches failed: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('sessions')
  .description('List all project sessions in the context database')
  .action(() => {
    try {
      executeSessions();
    } catch (err: any) {
      console.error(`Sessions failed: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
