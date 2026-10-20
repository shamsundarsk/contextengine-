import React, { useState } from 'react';
import { Branch, Commit } from '@context-engine/core';

interface ContextGraphTreeProps {
  sessionId: string;
  activeBranch: string;
  branches: Branch[];
  allBranchCommits: Record<string, Commit[]>;
  rawTreeText: string;
  onSelectBranch: (branchName: string) => void;
  onCheckout: (commitId: string) => void;
  onExpandCommit: (commit: Commit) => void;
  onRefresh: () => void;
}

export const ContextGraphTree: React.FC<ContextGraphTreeProps> = ({
  sessionId,
  activeBranch,
  branches,
  allBranchCommits,
  rawTreeText,
  onSelectBranch,
  onCheckout,
  onExpandCommit,
  onRefresh,
}) => {
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const [copied, setCopied] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawTreeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy tree text:', err);
    }
  };

  const filteredBranches = branches.filter((b) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    if (b.name.toLowerCase().includes(q)) return true;
    const bCommits = allBranchCommits[b.name] || [];
    return bCommits.some(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.topic_label.toLowerCase().includes(q) ||
        c.reason_log.toLowerCase().includes(q)
    );
  });

  return (
    <div
      style={{
        background: '#09090b',
        border: '1px solid #1c1c22',
        borderRadius: '12px',
        padding: '24px',
        color: '#e5e7eb',
      }}
    >
      {/* Header with Mode Switcher & Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid #18181b',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            🌳
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Context Memory Graph Tree
            </h3>
            <p style={{ fontSize: '12px', color: '#71717a', margin: '2px 0 0 0' }}>
              Full branch topology, commit chain, and retained facts for <code style={{ color: '#38bdf8' }}>{sessionId}</code>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Mode Switcher */}
          <div
            style={{
              display: 'flex',
              background: '#141418',
              border: '1px solid #27272a',
              borderRadius: '6px',
              padding: '2px',
            }}
          >
            <button
              onClick={() => setViewMode('visual')}
              style={{
                background: viewMode === 'visual' ? '#27272a' : 'transparent',
                color: viewMode === 'visual' ? '#ffffff' : '#71717a',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Visual Nodes
            </button>
            <button
              onClick={() => setViewMode('raw')}
              style={{
                background: viewMode === 'raw' ? '#27272a' : 'transparent',
                color: viewMode === 'raw' ? '#ffffff' : '#71717a',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Markdown Tree
            </button>
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#059669' : '#18181b',
              color: '#ffffff',
              border: '1px solid #27272a',
              borderRadius: '6px',
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s',
            }}
          >
            {copied ? '✓ Copied' : 'Copy Tree'}
          </button>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            style={{
              background: '#18181b',
              color: '#a1a1aa',
              border: '1px solid #27272a',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* Visual Mode */}
      {viewMode === 'visual' ? (
        <div>
          {/* Search/Filter Bar */}
          <div style={{ marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="Filter by branch, topic, or commit ID..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                width: '100%',
                background: '#040406',
                border: '1px solid #222228',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '13px',
                color: '#ffffff',
                outline: 'none',
                fontFamily: 'Inter, sans-serif',
              }}
            />
          </div>

          {filteredBranches.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#52525b',
                fontSize: '13px',
                background: '#040406',
                border: '1px dashed #222228',
                borderRadius: '8px',
              }}
            >
              No branches match filter &quot;{filterQuery}&quot;.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {filteredBranches.map((b) => {
                const isActive = b.name === activeBranch;
                const bCommits = allBranchCommits[b.name] || [];

                return (
                  <div
                    key={b.name}
                    style={{
                      background: '#0d0d12',
                      border: `1px solid ${isActive ? '#3b82f6' : '#22222a'}`,
                      borderRadius: '10px',
                      padding: '16px 20px',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    {/* Branch Header */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '14px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '16px' }}>🌿</span>
                        <span
                          style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: isActive ? '#60a5fa' : '#ffffff',
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                        >
                          {b.name}
                        </span>

                        {isActive ? (
                          <span
                            style={{
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: '12px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}
                          >
                            ACTIVE BRANCH
                          </span>
                        ) : (
                          <button
                            onClick={() => onSelectBranch(b.name)}
                            style={{
                              background: '#18181b',
                              color: '#a1a1aa',
                              border: '1px solid #27272a',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            Switch to this branch
                          </button>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: '11px',
                          color: '#71717a',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        HEAD → {b.head_commit_id ? b.head_commit_id.slice(0, 12) : '(none)'} · {bCommits.length} commits
                      </div>
                    </div>

                    {/* Commits on this branch */}
                    {bCommits.length === 0 ? (
                      <div
                        style={{
                          padding: '12px 16px',
                          background: '#040406',
                          borderRadius: '6px',
                          color: '#52525b',
                          fontSize: '12px',
                          fontStyle: 'italic',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        └── (no commits recorded on this branch yet)
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {bCommits.map((c, idx) => {
                          const isLast = idx === bCommits.length - 1;
                          const connector = isLast ? '└──' : '├──';
                          const chunks = c.chunks || [];
                          const keptCount = chunks.filter((ch) => ch.label === 'keep_verbatim').length;
                          const transientCount = chunks.filter((ch) => ch.tier === 'transient').length;
                          const dateStr = new Date(c.timestamp).toLocaleTimeString();

                          return (
                            <div
                              key={c.id}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                background: '#040406',
                                border: '1px solid #1a1a22',
                                borderRadius: '6px',
                                padding: '10px 14px',
                                transition: 'background 0.15s, border-color 0.15s',
                              }}
                            >
                              {/* Tree branch connector character */}
                              <div
                                style={{
                                  fontFamily: 'JetBrains Mono, monospace',
                                  color: '#52525b',
                                  fontSize: '13px',
                                  lineHeight: '20px',
                                  userSelect: 'none',
                                }}
                              >
                                {connector}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '6px',
                                    marginBottom: '4px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span
                                      style={{
                                        fontFamily: 'JetBrains Mono, monospace',
                                        fontSize: '12px',
                                        color: '#38bdf8',
                                        background: 'rgba(56, 189, 248, 0.1)',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                      }}
                                    >
                                      {c.id.slice(0, 10)}
                                    </span>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#f3f4f6' }}>
                                      {c.topic_label}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '11px', color: '#71717a' }}>{dateStr}</span>
                                </div>

                                <div
                                  style={{
                                    fontSize: '12px',
                                    color: '#9ca3af',
                                    lineHeight: '1.4',
                                    marginBottom: '6px',
                                  }}
                                >
                                  {c.reason_log}
                                </div>

                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '6px',
                                  }}
                                >
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    {keptCount > 0 && (
                                      <span
                                        style={{
                                          background: 'rgba(34, 197, 94, 0.12)',
                                          color: '#4ade80',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          padding: '1px 6px',
                                          borderRadius: '8px',
                                        }}
                                      >
                                        {keptCount} kept verbatim
                                      </span>
                                    )}
                                    {transientCount > 0 && (
                                      <span
                                        style={{
                                          background: 'rgba(168, 85, 247, 0.12)',
                                          color: '#c084fc',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          padding: '1px 6px',
                                          borderRadius: '8px',
                                        }}
                                      >
                                        {transientCount} transient
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      onClick={() => onCheckout(c.id)}
                                      style={{
                                        background: '#141418',
                                        border: '1px solid #282830',
                                        borderRadius: '4px',
                                        color: '#d1d5db',
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Checkout
                                    </button>
                                    <button
                                      onClick={() => onExpandCommit(c)}
                                      style={{
                                        background: '#141418',
                                        border: '1px solid #282830',
                                        borderRadius: '4px',
                                        color: '#d1d5db',
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Inspect Chunks
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Raw Markdown / Terminal View */
        <div>
          <pre
            style={{
              background: '#040406',
              border: '1px solid #1a1a22',
              borderRadius: '8px',
              padding: '18px 20px',
              color: '#a1a1aa',
              fontSize: '13px',
              fontFamily: 'JetBrains Mono, Menlo, monospace',
              lineHeight: 1.6,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}
          >
            {rawTreeText || 'No context graph tree data available.'}
          </pre>
        </div>
      )}
    </div>
  );
};
