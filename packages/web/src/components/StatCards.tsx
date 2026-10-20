import React from 'react';
import { SessionStats } from '@context-engine/core';

interface StatCardsProps {
  stats: SessionStats | null;
}

export const StatCards: React.FC<StatCardsProps> = ({ stats }) => {
  const savingsPct = stats ? Math.max(0, Math.min(100, stats.tokensSavedPct)) : 0;
  const commits = stats ? stats.totalCommits : 0;
  const branch = stats ? stats.activeBranch : 'main';

  // Cost: use 4dp for small values so it doesn't always show $0.00
  const costRaw = stats ? stats.estimatedCostSavedUSD : 0;
  const cost = costRaw >= 0.01
    ? `$${costRaw.toFixed(2)}`
    : costRaw > 0
    ? `$${costRaw.toFixed(4)}`
    : '$0.0000';

  // Token breakdown for tooltip-style sub-label
  const rawTok = stats ? stats.totalOriginalTokens.toLocaleString() : '0';
  const optTok = stats ? stats.totalOptimizedTokens.toLocaleString() : '0';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '40px',
        padding: '12px 0 36px 0',
      }}
    >
      <div>
        <div style={{ fontSize: '13px', color: '#71717a', marginBottom: '6px', fontWeight: 400 }}>
          Tokens saved
        </div>
        <div style={{ fontSize: '34px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {savingsPct}%
        </div>
        <div style={{ fontSize: '11px', color: '#3f3f46', marginTop: '5px' }}>
          {rawTok} → {optTok} tokens
        </div>
      </div>

      <div>
        <div style={{ fontSize: '13px', color: '#71717a', marginBottom: '6px', fontWeight: 400 }}>
          Cost saved
        </div>
        <div style={{ fontSize: '34px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {cost}
        </div>
        <div style={{ fontSize: '11px', color: '#3f3f46', marginTop: '5px' }}>
          ~$0.003 / 1K tokens saved
        </div>
      </div>

      <div>
        <div style={{ fontSize: '13px', color: '#71717a', marginBottom: '6px', fontWeight: 400 }}>
          Commits
        </div>
        <div style={{ fontSize: '34px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {commits}
        </div>
        <div style={{ fontSize: '11px', color: '#3f3f46', marginTop: '5px' }}>
          {stats ? stats.keptVerbatimCount : 0} kept · {stats ? stats.summarizedCount : 0} summarized
        </div>
      </div>

      <div>
        <div style={{ fontSize: '13px', color: '#71717a', marginBottom: '6px', fontWeight: 400 }}>
          Active branch
        </div>
        <div
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {branch}
        </div>
        {stats && stats.conflictCount > 0 && (
          <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '5px' }}>
            ⚠ {stats.conflictCount} conflict{stats.conflictCount > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};
