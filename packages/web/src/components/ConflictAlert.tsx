import React from 'react';
import { Conflict } from '@context-engine/core';

interface ConflictAlertProps {
  conflicts: Conflict[];
  onResolve: (conflictId: string) => void;
}

export const ConflictAlert: React.FC<ConflictAlertProps> = ({ conflicts, onResolve }) => {
  const unresolved = conflicts.filter((c) => !c.resolved);

  if (unresolved.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: '20px',
        padding: '16px 20px',
        borderRadius: '6px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid #ef4444',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          ⚠️ {unresolved.length} UNRESOLVED BRANCH CONFLICT{unresolved.length > 1 ? 'S' : ''} DETECTED
        </h4>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {unresolved.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              borderRadius: '4px',
              background: '#000000',
              border: '1px solid #242429',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ffffff', fontFamily: 'JetBrains Mono, monospace' }}>
                TOPIC: <span style={{ color: '#ef4444' }}>{c.topic_label}</span> ({c.branch_a} ↔ {c.branch_b})
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '2px' }}>
                {c.description}
              </div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={() => onResolve(c.id)}
            >
              Mark Resolved
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
