import React from 'react';
import { Commit } from '@context-engine/core';

interface CommitTimelineProps {
  commits: Commit[];
  headCommitId: string | null;
  onCheckout: (commitId: string) => void;
  onExpandCommit: (commit: Commit) => void;
}

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export const CommitTimeline: React.FC<CommitTimelineProps> = ({
  commits,
  onCheckout,
  onExpandCommit,
}) => {
  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#e5e7eb', margin: 0 }}>
          Commit log
        </h3>
      </div>

      {commits.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '14px',
            background: '#09090b',
            border: '1px solid #1a1a20',
            borderRadius: '10px',
          }}
        >
          No commits recorded for this session yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {commits.map((c) => {
            const chunks = c.chunks || [];
            const keptCount = chunks.filter((ch) => ch.label === 'keep_verbatim').length;
            const summarizeCount = chunks.filter((ch) => ch.label === 'summarize').length;
            const discardCount = chunks.filter((ch) => ch.label === 'discard').length;
            const timeAgo = formatTimeAgo(c.timestamp);

            return (
              <div
                key={c.id}
                style={{
                  background: '#0a0a0d',
                  border: '1px solid #1c1c22',
                  borderRadius: '10px',
                  padding: '18px 20px',
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Title & Time */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>
                    {c.topic_label}
                  </div>
                  <div style={{ fontSize: '13px', color: '#71717a', flexShrink: 0, marginLeft: '12px' }}>
                    {timeAgo}
                  </div>
                </div>

                {/* Badges row (only show badges with count > 0) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  {keptCount > 0 && (
                    <span
                      style={{
                        background: 'rgba(34, 197, 94, 0.12)',
                        color: '#22c55e',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                      }}
                    >
                      kept {keptCount}
                    </span>
                  )}

                  {summarizeCount > 0 && (
                    <span
                      style={{
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: '#f59e0b',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                      }}
                    >
                      summarized {summarizeCount}
                    </span>
                  )}

                  {discardCount > 0 && (
                    <span
                      style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#ef4444',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                      }}
                    >
                      discarded {discardCount}
                    </span>
                  )}
                </div>

                {/* Reason log description */}
                <div
                  style={{
                    fontSize: '13.5px',
                    color: '#9ca3af',
                    lineHeight: 1.5,
                    marginBottom: '14px',
                  }}
                >
                  {c.reason_log}
                </div>

                {/* Action Buttons: Checkout & Expand */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => onCheckout(c.id)}
                    style={{
                      background: '#141418',
                      border: '1px solid #282830',
                      borderRadius: '6px',
                      color: '#e5e7eb',
                      padding: '5px 14px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#1e1e24';
                      e.currentTarget.style.borderColor = '#3f3f46';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#141418';
                      e.currentTarget.style.borderColor = '#282830';
                    }}
                  >
                    Checkout
                  </button>

                  <button
                    onClick={() => onExpandCommit(c)}
                    style={{
                      background: '#141418',
                      border: '1px solid #282830',
                      borderRadius: '6px',
                      color: '#e5e7eb',
                      padding: '5px 14px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#1e1e24';
                      e.currentTarget.style.borderColor = '#3f3f46';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#141418';
                      e.currentTarget.style.borderColor = '#282830';
                    }}
                  >
                    Expand
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
