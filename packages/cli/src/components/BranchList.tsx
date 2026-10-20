import React from 'react';
import { Box, Text } from 'ink';
import { Branch } from '@context-engine/core';

interface BranchListProps {
  branches: Branch[];
  activeBranch: string;
}

export const BranchList: React.FC<BranchListProps> = ({ branches, activeBranch }) => {
  return (
    <Box borderStyle="single" borderColor="blue" flexDirection="column" paddingX={1} width={30}>
      <Text bold color="blue">
        BRANCHES
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {branches.length === 0 ? (
          <Text dimColor>No branches found</Text>
        ) : (
          branches.map((b) => {
            const isActive = b.name === activeBranch;
            return (
              <Box key={b.name} justifyContent="space-between">
                <Text color={isActive ? 'green' : 'white'} bold={isActive}>
                  {isActive ? '● ' : '  '}
                  {b.name}
                </Text>
                {isActive && <Text color="green" dimColor> [ACTIVE]</Text>}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
};
