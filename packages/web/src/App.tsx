import React, { useEffect, useState, useCallback } from 'react';
import { Branch, Commit, Conflict, SessionStats, SessionSummary, TriageLabel } from '@context-engine/core';
import {
  fetchStats,
  fetchBranches,
  fetchCommits,
  fetchConflicts,
  fetchSessions,
  checkoutCommit,
  createBranch,
  switchBranch,
  mergeBranch,
  promoteChunk,
  resolveConflict,
} from './api.js';
import { StatCards } from './components/StatCards.js';
import { BranchList } from './components/BranchList.js';
import { CommitTimeline } from './components/CommitTimeline.js';
import { ConflictAlert } from './components/ConflictAlert.js';
import { CommitDetailModal } from './components/CommitDetailModal.js';
import { ContextGatherer } from './components/ContextGatherer.js';
import { ProjectsLanding } from './components/ProjectsLanding.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type View = 'projects' | 'dashboard';

// ─── Root App ────────────────────────────────────────────────────────────────

export const App: React.FC = () => {
  const [view, setView] = useState<View>('projects');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string>('default_session');
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  // activeBranch is the branch the USER last intentionally selected (not reset by poll)
  const [activeBranch, setActiveBranch] = useState<string>('main');
  const [commits, setCommits] = useState<Commit[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [headCommitId, setHeadCommitId] = useState<string | null>(null);
  const [showGathererModal, setShowGathererModal] = useState<boolean>(false);

  // ── Data loader ──────────────────────────────────────────────────────────
  // NOTE: activeBranch is intentionally NOT in this callback's closure deps —
  // the poll must NOT override an active user branch selection.
  const loadDashboardData = useCallback(
    async (overrideActiveBranch?: string) => {
      try {
        const [sessionsData, statsData, branchData, conflictData] = await Promise.all([
          fetchSessions(),
          fetchStats(sessionId),
          fetchBranches(sessionId),
          fetchConflicts(sessionId),
        ]);

        setSessions(sessionsData);
        setStats(statsData);
        setBranches(branchData);
        setConflicts(conflictData);

        // Only set activeBranch when an explicit override is given (initial load / after
        // a branch switch).  Regular polls leave activeBranch alone so the user's
        // selection doesn't get reverted by the 3-second interval.
        const branchToUse = overrideActiveBranch ?? statsData.activeBranch ?? 'main';
        if (overrideActiveBranch !== undefined) {
          setActiveBranch(branchToUse);
        }

        const commitsData = await fetchCommits(sessionId, branchToUse);
        setCommits(commitsData);

        if (commitsData.length > 0) {
          setHeadCommitId(commitsData[0].id);
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    },
    [sessionId]
  );

  // ── Initial session pick ─────────────────────────────────────────────────
  useEffect(() => {
    fetchSessions()
      .then((sessList) => {
        setSessions(sessList);
        if (sessList.length > 0) {
          const hasDefault = sessList.find(
            (s) => s.sessionId === 'default_session' && s.commitCount > 0
          );
          if (hasDefault) {
            setSessionId('default_session');
          } else {
            const withCommits = sessList.find((s) => s.commitCount > 0);
            if (withCommits) setSessionId(withCommits.sessionId);
          }
        }
      })
      .catch(console.error);
  }, []);

  // ── Poll every 3 s (no override → keeps user branch selection) ───────────
  useEffect(() => {
    // Initial load uses the DB's active branch as override
    loadDashboardData(undefined); // let it read from statsData.activeBranch first time
    const interval = setInterval(() => loadDashboardData(), 3000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  // ── Branch selection (now persists to DB) ────────────────────────────────
  const handleSelectBranch = async (branchName: string) => {
    try {
      await switchBranch(sessionId, branchName);
      // Pass as override so activeBranch state is updated and commits re-fetched
      setActiveBranch(branchName);
      const branchCommits = await fetchCommits(sessionId, branchName);
      setCommits(branchCommits);
    } catch (err) {
      console.error('Failed to switch branch:', err);
    }
  };

  const handleCheckout = async (commitId: string) => {
    try {
      await checkoutCommit(sessionId, commitId);
      await loadDashboardData(undefined);
    } catch (err: any) {
      alert(`Checkout failed: ${err.message}`);
    }
  };

  const handleCreateBranch = async (name: string) => {
    try {
      const created = await createBranch(sessionId, name);
      // After creation, switch to the new branch (creation already sets it active in DB)
      setActiveBranch(created.name);
      await loadDashboardData(created.name);
    } catch (err: any) {
      alert(`Branch creation failed: ${err.message}`);
    }
  };

  const handleMergeBranch = async (source: string, target: string) => {
    try {
      const res = await mergeBranch(sessionId, source, target);
      if (!res.success) {
        alert(
          `CONFLICT DETECTED!\nMerge failed due to conflicting facts.\nConflict ID: ${res.conflict?.id}`
        );
      } else {
        alert(`Successfully merged '${source}' into '${target}'!`);
      }
      await loadDashboardData();
    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    }
  };

  const handlePromoteChunk = async (chunkId: string, newLabel: TriageLabel) => {
    try {
      await promoteChunk(chunkId, newLabel);
      if (selectedCommit) {
        const updatedChunks = (selectedCommit.chunks || []).map((ch) =>
          ch.id === chunkId ? { ...ch, label: newLabel } : ch
        );
        setSelectedCommit({ ...selectedCommit, chunks: updatedChunks });
      }
      await loadDashboardData();
    } catch (err: any) {
      alert(`Promote failed: ${err.message}`);
    }
  };

  const handleResolveConflict = async (conflictId: string) => {
    try {
      await resolveConflict(conflictId);
      await loadDashboardData();
    } catch (err: any) {
      alert(`Resolve conflict failed: ${err.message}`);
    }
  };

  const handleOpenProject = (sid: string) => {
    setSessionId(sid);
    setView('dashboard');
  };

  // ── Views ────────────────────────────────────────────────────────────────

  if (view === 'projects') {
    return (
      <ProjectsLanding
        sessions={sessions}
        onOpen={handleOpenProject}
        onRefresh={() => fetchSessions().then(setSessions).catch(console.error)}
      />
    );
  }

  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '36px 40px',
        minHeight: '100vh',
        background: '#000000',
      }}
    >
      {/* Back to projects breadcrumb */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => setView('projects')}
          style={{
            background: 'none',
            border: 'none',
            color: '#52525b',
            fontSize: '12px',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#a1a1aa')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#52525b')}
        >
          ← All Projects
        </button>
        <div
          style={{
            marginTop: '6px',
            fontSize: '18px',
            fontWeight: 600,
            color: '#ffffff',
            letterSpacing: '-0.3px',
          }}
        >
          {sessionId}
        </div>
      </div>

      {/* Conflict Alert */}
      <ConflictAlert conflicts={conflicts} onResolve={handleResolveConflict} />

      {/* Stats */}
      <StatCards stats={stats} />

      {/* Main two-column layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '200px 1fr',
          gap: '48px',
          alignItems: 'start',
          marginTop: '16px',
          marginBottom: '40px',
        }}
      >
        <BranchList
          branches={branches}
          activeBranch={activeBranch}
          onSelectBranch={handleSelectBranch}
          onCreateBranch={handleCreateBranch}
          onMergeBranch={handleMergeBranch}
        />
        <CommitTimeline
          commits={commits}
          headCommitId={headCommitId}
          onCheckout={handleCheckout}
          onExpandCommit={(c) => setSelectedCommit(c)}
        />
      </div>

      {/* Floating utility pill */}
      <div
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '20px',
          background: 'rgba(13, 13, 16, 0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #242429',
          borderRadius: '24px',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 90,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        <button
          onClick={() => loadDashboardData()}
          disabled={loading}
          style={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '4px',
            color: '#d1d5db',
            padding: '2px 8px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          {loading ? '...' : 'Refresh'}
        </button>

        <button
          onClick={() => setShowGathererModal(true)}
          style={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '4px',
            color: '#a1a1aa',
            padding: '2px 8px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
          title="Open Context Gatherer"
        >
          Inspect Context
        </button>
      </div>

      {/* Context Gatherer Modal */}
      {showGathererModal && (
        <div className="modal-overlay" onClick={() => setShowGathererModal(false)}>
          <div
            style={{
              maxWidth: '960px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#09090b',
              border: '1px solid #27272a',
              borderRadius: '12px',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                Context Memory Inspector
              </span>
              <button
                onClick={() => setShowGathererModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#71717a',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <ContextGatherer
              sessionId={sessionId}
              sessions={sessions}
              onSelectSession={(sid) => {
                setSessionId(sid);
                setShowGathererModal(false);
              }}
              onRefresh={loadDashboardData}
            />
          </div>
        </div>
      )}

      {/* Commit Details Modal */}
      <CommitDetailModal
        commit={selectedCommit}
        onClose={() => setSelectedCommit(null)}
        onPromote={handlePromoteChunk}
      />
    </div>
  );
};
