import React from 'react';
import { Box, Text } from 'ink';
import { SessionStats } from '@context-engine/core';

interface StatsBarProps {
  stats: SessionStats;
}

export const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  return (
    <Box
      borderStyle="double"
      borderColor="cyan"
      paddingX={1}
      justifyContent="space-between"
      flexDirection="row"
    >
      <Text bold color="cyan">
        CONTEXT ENGINE WATCHER
      </Text>
      <Text>
        Branch: <Text color="green" bold>{stats.activeBranch}</Text>
      </Text>
      <Text>
        Tokens Saved: <Text color="magenta" bold>{stats.tokensSavedPct}%</Text>
      </Text>
      <Text>
        Est. Cost Saved: <Text color="yellow" bold>${stats.estimatedCostSavedUSD}</Text>
      </Text>
      <Text>
        Commits: <Text color="white" bold>{stats.totalCommits}</Text>
      </Text>
    </Box>
  );
};
