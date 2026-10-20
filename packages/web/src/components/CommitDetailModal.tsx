import React from 'react';
import { Chunk, Commit, TriageLabel } from '@context-engine/core';

interface CommitDetailModalProps {
  commit: Commit | null;
  onClose: () => void;
  onPromote: (chunkId: string, newLabel: TriageLabel) => void;
}

export const CommitDetailModal: React.FC<CommitDetailModalProps> = ({
  commit,
  onClose,
  onPromote,
}) => {
  if (!commit) return null;

  const chunks = commit.chunks || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          width: '750px',
          maxWidth: '95vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0d0d10',
          border: '1px solid #242429',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              COMMIT DETAILS
            </h2>
            <code style={{ fontSize: '0.8rem', color: '#22c55e', background: '#000000', padding: '2px 6px', borderRadius: '4px', border: '1px solid #242429' }}>
              {commit.id}
            </code>
          </div>
          <button
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '16px', background: '#000000', padding: '12px 14px', borderRadius: '6px', border: '1px solid #242429' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ffffff', marginBottom: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
            TOPIC: <span style={{ color: '#22c55e' }}>{commit.topic_label}</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#8e8e93' }}>
            {commit.reason_log}
          </div>
        </div>

        <h4 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', color: '#8e8e93' }}>
          TRIAGED CHUNKS ({chunks.length})
        </h4>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
          {chunks.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#8e8e93', fontSize: '0.8rem' }}>
              No chunks attached to this commit.
            </div>
          ) : (
            chunks.map((chunk: Chunk) => {
              const badgeClass =
                chunk.label === 'keep_verbatim'
                  ? 'badge-verbatim'
                  : chunk.label === 'summarize'
                  ? 'badge-summarize'
                  : 'badge-discard';

              return (
                <div
                  key={chunk.id}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: '#000000',
                    border: '1px solid #242429',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span className={`badge ${badgeClass}`}>{chunk.label.toUpperCase()}</span>
                    {chunk.source_ref && (
                      <span style={{ fontSize: '0.7rem', color: '#8e8e93', fontFamily: 'JetBrains Mono, monospace' }}>
                        ref: {chunk.source_ref}
                      </span>
                    )}
                  </div>

                  <pre
                    style={{
                      fontSize: '0.8rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: '#ffffff',
                      background: '#09090b',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      border: '1px solid #1c1c21',
                      marginBottom: '8px',
                      maxHeight: '140px',
                      overflowY: 'auto',
                    }}
                  >
                    {chunk.content}
                  </pre>

                  {chunk.label !== 'keep_verbatim' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '3px 8px', fontSize: '0.725rem' }}
                        onClick={() => onPromote(chunk.id, 'keep_verbatim')}
                      >
                        Promote to Kept Verbatim
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
