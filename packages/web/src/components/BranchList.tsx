import React, { useState } from 'react';
import { Branch } from '@context-engine/core';

interface BranchListProps {
  branches: Branch[];
  activeBranch: string;
  onSelectBranch: (branchName: string) => void;
  onCreateBranch: (name: string) => void;
  onMergeBranch: (sourceBranch: string, targetBranch: string) => void;
}

const GitBranchIcon: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <line x1="6" y1="3" x2="6" y2="15"></line>
    <circle cx="18" cy="6" r="3"></circle>
    <circle cx="6" cy="18" r="3"></circle>
    <path d="M18 9a9 9 0 0 1-9 9"></path>
  </svg>
);

export const BranchList: React.FC<BranchListProps> = ({
  branches,
  activeBranch,
  onSelectBranch,
  onCreateBranch,
  onMergeBranch,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('main');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    onCreateBranch(newBranchName.trim());
    setNewBranchName('');
    setShowCreateModal(false);
  };

  const handleMerge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceBranch.trim()) return;
    onMergeBranch(sourceBranch, targetBranch);
    setShowMergeModal(false);
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 500, color: '#9ca3af', margin: 0 }}>
          Branches
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {branches.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#6b7280', padding: '8px 0' }}>No branches</div>
        ) : (
          branches.map((b) => {
            const isActive = b.name === activeBranch;
            return (
              <div
                key={b.name}
                onClick={() => onSelectBranch(b.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: isActive ? 'rgba(30, 58, 138, 0.22)' : 'transparent',
                  transition: 'background 0.15s ease',
                }}
              >
                <GitBranchIcon color={isActive ? '#60a5fa' : '#9ca3af'} />
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? '#60a5fa' : '#9ca3af',
                  }}
                >
                  {b.name}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '12px', paddingLeft: '8px' }}>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#52525b',
            fontSize: '11px',
            cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#a1a1aa')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#52525b')}
        >
          + New branch
        </button>
        <button
          onClick={() => setShowMergeModal(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#52525b',
            fontSize: '11px',
            cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#a1a1aa')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#52525b')}
        >
          Merge
        </button>
      </div>

      {/* Create Branch Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div
            style={{
              background: '#0d0d10',
              border: '1px solid #242429',
              borderRadius: '8px',
              padding: '24px',
              width: '380px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#ffffff', fontWeight: 600 }}>
              Create New Branch
            </h3>
            <form onSubmit={handleCreate}>
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="branch-name"
                style={{
                  width: '100%',
                  background: '#000000',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#ffffff',
                  fontSize: '13px',
                  marginBottom: '16px',
                  outline: 'none',
                }}
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    background: '#18181b',
                    border: '1px solid #27272a',
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#ffffff',
                    border: 'none',
                    color: '#000000',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Branch Modal */}
      {showMergeModal && (
        <div className="modal-overlay" onClick={() => setShowMergeModal(false)}>
          <div
            style={{
              background: '#0d0d10',
              border: '1px solid #242429',
              borderRadius: '8px',
              padding: '24px',
              width: '380px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#ffffff', fontWeight: 600 }}>
              Merge Branches
            </h3>
            <form onSubmit={handleMerge}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>
                  Source Branch
                </label>
                <select
                  value={sourceBranch}
                  onChange={(e) => setSourceBranch(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#000000',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  <option value="">Select source branch...</option>
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>
                  Target Branch
                </label>
                <select
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#000000',
                    border: '1px solid #27272a',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  style={{
                    background: '#18181b',
                    border: '1px solid #27272a',
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: '#ffffff',
                    border: 'none',
                    color: '#000000',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Merge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
