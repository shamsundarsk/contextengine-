import React from 'react';
import { Box, Text } from 'ink';
import { Commit } from '@context-engine/core';

interface CommitLogProps {
  commits: Commit[];
}

export const CommitLog: React.FC<CommitLogProps> = ({ commits }) => {
  return (
    <Box borderStyle="single" borderColor="magenta" flexDirection="column" paddingX={1} flexGrow={1}>
      <Text bold color="magenta">
        COMMIT LOG & TRIAGE HISTORY
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {commits.length === 0 ? (
          <Text dimColor>No commits yet for this session.</Text>
        ) : (
          commits.slice(0, 8).map((c) => {
            const chunks = c.chunks || [];
            const keptCount = chunks.filter((ch) => ch.label === 'keep_verbatim').length;
            const summarizeCount = chunks.filter((ch) => ch.label === 'summarize').length;
            const discardCount = chunks.filter((ch) => ch.label === 'discard').length;
            const timeStr = new Date(c.timestamp).toLocaleTimeString();

            return (
              <Box key={c.id} flexDirection="column" marginBottom={1}>
                <Box justifyContent="space-between">
                  <Text bold color="yellow">
                    {c.id.slice(0, 14)} <Text color="white">[{c.topic_label}]</Text>
                  </Text>
                  <Text dimColor>{timeStr}</Text>
                </Box>
                <Box marginLeft={2}>
                  <Text dimColor>{c.reason_log}</Text>
                </Box>
                <Box marginLeft={2} gap={1}>
                  <Text color="green">Kept: {keptCount}</Text>
                  <Text color="yellow">Summarized: {summarizeCount}</Text>
                  <Text color="gray">Discarded: {discardCount}</Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
};
