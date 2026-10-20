import React, { useState } from 'react';
import { SessionSummary } from '@context-engine/core';

interface ProjectsLandingProps {
  sessions: SessionSummary[];
  onOpen: (sessionId: string) => void;
  onRefresh: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function BranchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function CommitIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17.01" y1="12" x2="22.96" y2="12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export const ProjectsLanding: React.FC<ProjectsLandingProps> = ({ sessions, onOpen, onRefresh }) => {
  const [newProjectName, setNewProjectName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    onOpen(name);
    setNewProjectName('');
    setShowCreate(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000000',
        fontFamily: 'Inter, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid #18181b',
          padding: '0 48px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Context Engine logo mark */}
          <div
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #6c63ff 0%, #43e8d8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.5px',
            }}
          >
            CE
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
            Context Engine
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={onRefresh}
            style={{
              background: 'transparent',
              border: '1px solid #27272a',
              borderRadius: '6px',
              color: '#71717a',
              padding: '5px 12px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3f3f46')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#27272a')}
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              background: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              color: '#000000',
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: '#ffffff',
              margin: 0,
              letterSpacing: '-0.5px',
            }}
          >
            Projects
          </h1>
          <p style={{ color: '#71717a', fontSize: '13px', marginTop: '6px' }}>
            Each project is a versioned context memory session for an AI workspace.
          </p>
        </div>

        {/* Project grid */}
        {sessions.length === 0 ? (
          <div
            style={{
              border: '1px dashed #27272a',
              borderRadius: '12px',
              padding: '64px 32px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '13px', color: '#52525b', marginBottom: '16px' }}>
              No projects yet. Create one to start tracking context memory.
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '6px',
                color: '#a1a1aa',
                padding: '8px 20px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Create first project
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '12px',
            }}
          >
            {sessions.map((s) => (
              <ProjectCard key={s.sessionId} session={s} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>

      {/* Create project modal */}
      {showCreate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowCreate(false)}
        >
          <div
            style={{
              background: '#0d0d10',
              border: '1px solid #242429',
              borderRadius: '12px',
              padding: '28px',
              width: '400px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: '#ffffff', fontWeight: 600 }}>
              New Project
            </h3>
            <form onSubmit={handleCreate}>
              <label style={{ fontSize: '12px', color: '#9ca3af', display: 'block', marginBottom: '6px' }}>
                Project name (used as session ID)
              </label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="my-project"
                style={{
                  width: '100%',
                  background: '#000000',
                  border: '1px solid #27272a',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#ffffff',
                  fontSize: '13px',
                  marginBottom: '20px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  style={{
                    background: '#18181b',
                    border: '1px solid #27272a',
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '7px 16px',
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
                    padding: '7px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Create & Open
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Project Card ─────────────────────────────────────────────────────────────

interface ProjectCardProps {
  session: SessionSummary;
  onOpen: (sessionId: string) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ session, onOpen }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onOpen(session.sessionId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#0d0d10' : 'transparent',
        border: `1px solid ${hovered ? '#3f3f46' : '#27272a'}`,
        borderRadius: '10px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Project name */}
      <div
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: '#ffffff',
          marginBottom: '12px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {session.sessionId}
      </div>

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#71717a', fontSize: '12px' }}>
          <CommitIcon />
          <span>{session.commitCount} commits</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#71717a', fontSize: '12px' }}>
          <BranchIcon />
          <span>{session.activeBranch}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#52525b', fontSize: '11px' }}>
          <ClockIcon />
          <span>{formatDate(session.lastActive)}</span>
        </div>
        <div
          style={{
            fontSize: '11px',
            color: hovered ? '#ffffff' : '#52525b',
            transition: 'color 0.15s',
          }}
        >
          Open →
        </div>
      </div>
    </div>
  );
};
