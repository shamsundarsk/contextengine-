import React, { useState, useEffect, useCallback } from 'react';
import { ReconstructedContext, SessionSummary } from '@context-engine/core';
import { fetchContext, gatherQuery } from '../api.js';

interface ContextGathererProps {
  sessionId: string;
  sessions: SessionSummary[];
  onSelectSession: (id: string) => void;
  onRefresh: () => void;
}

export const ContextGatherer: React.FC<ContextGathererProps> = ({
  sessionId,
  sessions,
  onSelectSession,
  onRefresh,
}) => {
  const [context, setContext] = useState<ReconstructedContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'branch' | 'all'>('all');
  const [searchResults, setSearchResults] = useState<{
    query: string;
    matchedCommitsCount: number;
    gatheredFactsCount: number;
    facts: { commitId: string; topic: string; branch: string; content: string; sourceRef?: string }[];
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'assembled' | 'search'>('assembled');

  const loadContext = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchContext(sessionId);
      setContext(data);
    } catch (err) {
      console.error('Failed to load reconstructed context:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const handleCopy = async () => {
    if (!context?.fullPromptText) return;
    try {
      await navigator.clipboard.writeText(context.fullPromptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearching(true);
    try {
      const res = await gatherQuery(sessionId, searchQuery, searchScope);
      setSearchResults(res);
      setActiveTab('search');
    } catch (err) {
      console.error('Failed to search gatherer:', err);
    } finally {
      setSearching(false);
    }
  };

  const tokensSaved = context ? Math.max(0, context.rawTokenCount - context.reconstructedTokenCount) : 0;

  return (
    <div
      style={{
        background: '#0d0d10',
        border: '1px solid #242429',
        borderRadius: '8px',
        padding: '20px',
        marginTop: '24px',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid #242429',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              background: '#22c55e',
              color: '#000000',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 800,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            GATHERER
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
              CONTEXT GATHERER & RECONSTRUCTOR
            </h2>
            <p style={{ fontSize: '0.75rem', color: '#8e8e93', margin: '2px 0 0 0' }}>
              Persistent cross-chat memory loaded by Kiro's new chat sessions
            </p>
          </div>
        </div>

        {/* Controls: Session selector + Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>Session:</span>
            <select
              value={sessionId}
              onChange={(e) => onSelectSession(e.target.value)}
              style={{
                background: '#000000',
                color: '#ffffff',
                border: '1px solid #242429',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.75rem',
                fontFamily: 'JetBrains Mono, monospace',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.sessionId} ({s.commitCount} commits)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCopy}
            disabled={!context?.fullPromptText}
            style={{
              background: copied ? '#22c55e' : '#ffffff',
              color: '#000000',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s',
            }}
          >
            {copied ? '✓ Copied to Clipboard!' : 'Copy for New Chat'}
          </button>

          <button
            onClick={() => {
              loadContext();
              onRefresh();
            }}
            disabled={loading}
            style={{
              background: '#18181b',
              color: '#ffffff',
              border: '1px solid #242429',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Token Compression Economy Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          background: '#000000',
          border: '1px solid #242429',
          borderRadius: '6px',
          padding: '12px 16px',
          marginBottom: '16px',
        }}
      >
        <div>
          <div style={{ fontSize: '0.7rem', color: '#8e8e93', textTransform: 'uppercase' }}>Active Branch</div>
          <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
            {context?.activeBranch || 'main'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.7rem', color: '#8e8e93', textTransform: 'uppercase' }}>Bounded / Raw Tokens</div>
          <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
            {context ? context.reconstructedTokenCount.toLocaleString() : '0'} / {context ? context.rawTokenCount.toLocaleString() : '0'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.7rem', color: '#8e8e93', textTransform: 'uppercase' }}>Token Savings</div>
          <div style={{ fontSize: '0.9rem', color: '#22c55e', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
            +{context?.tokensSavedPct || 0}% ({tokensSaved.toLocaleString()} tokens saved)
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.7rem', color: '#8e8e93', textTransform: 'uppercase' }}>Kept Facts Preserved</div>
          <div style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', marginTop: '2px' }}>
            {context?.keptVerbatim.length || 0} facts verbatim
          </div>
        </div>
      </div>

      {/* Tabs & Search Input */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('assembled')}
            style={{
              background: activeTab === 'assembled' ? '#ffffff' : '#18181b',
              color: activeTab === 'assembled' ? '#000000' : '#8e8e93',
              border: '1px solid #242429',
              borderRadius: '4px',
              padding: '5px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Assembled Prompt for LLM
          </button>
          <button
            onClick={() => setActiveTab('search')}
            style={{
              background: activeTab === 'search' ? '#ffffff' : '#18181b',
              color: activeTab === 'search' ? '#000000' : '#8e8e93',
              border: '1px solid #242429',
              borderRadius: '4px',
              padding: '5px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Live Recall Simulator {searchResults ? `(${searchResults.gatheredFactsCount})` : ''}
          </button>
        </div>

        {/* Live Search Form */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search context (e.g. database, styles, ports)..."
            style={{
              background: '#000000',
              color: '#ffffff',
              border: '1px solid #242429',
              borderRadius: '4px',
              padding: '5px 10px',
              fontSize: '0.75rem',
              width: '260px',
              outline: 'none',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          />
          <select
            value={searchScope}
            onChange={(e) => setSearchScope(e.target.value as any)}
            style={{
              background: '#000000',
              color: '#ffffff',
              border: '1px solid #242429',
              borderRadius: '4px',
              padding: '5px 8px',
              fontSize: '0.75rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Branches</option>
            <option value="branch">Active Branch</option>
          </select>
          <button
            type="submit"
            disabled={searching}
            style={{
              background: '#22c55e',
              color: '#000000',
              border: 'none',
              borderRadius: '4px',
              padding: '5px 10px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {searching ? '...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Main Content Pane */}
      {activeTab === 'assembled' ? (
        <div
          style={{
            background: '#000000',
            border: '1px solid #242429',
            borderRadius: '6px',
            padding: '16px',
            maxHeight: '400px',
            overflowY: 'auto',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.78rem',
            lineHeight: 1.6,
            color: '#e4e4e7',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {context?.fullPromptText ? (
            <div>
              {context.summaries.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: '#22c55e', fontWeight: 800, marginBottom: '6px' }}>
                    === CONTEXT SUMMARY (SYNTHESIZED ROLLING SUMMARY) ===
                  </div>
                  <div style={{ color: '#d4d4d8', paddingLeft: '8px', borderLeft: '2px solid #22c55e' }}>
                    {context.summaries.join('\n\n')}
                  </div>
                </div>
              )}

              {context.keptVerbatim.length > 0 && (
                <div>
                  <div style={{ color: '#22c55e', fontWeight: 800, marginBottom: '6px' }}>
                    === RELEVANT CONTEXT (VERBATIM ARCHITECTURAL FACTS) ===
                  </div>
                  <div style={{ paddingLeft: '8px', borderLeft: '2px solid #242429' }}>
                    {context.keptVerbatim.map((fact, idx) => (
                      <div
                        key={fact.id || idx}
                        style={{
                          marginBottom: '10px',
                          background: '#09090b',
                          padding: '8px 12px',
                          borderRadius: '4px',
                          border: '1px solid #1f1f23',
                        }}
                      >
                        <div style={{ fontSize: '0.68rem', color: '#8e8e93', marginBottom: '4px' }}>
                          [{fact.source_ref || 'fact'}]
                        </div>
                        <div style={{ color: '#ffffff' }}>{fact.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#71717a', textAlign: 'center', padding: '24px' }}>
              No commits recorded in session '{sessionId}' yet. Commit architectural decisions or trigger requests through the proxy to view gathered context.
            </div>
          )}
        </div>
      ) : (
        /* Search / Simulator View */
        <div
          style={{
            background: '#000000',
            border: '1px solid #242429',
            borderRadius: '6px',
            padding: '16px',
            maxHeight: '400px',
            overflowY: 'auto',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.78rem',
          }}
        >
          {searchResults ? (
            <div>
              <div style={{ color: '#8e8e93', marginBottom: '12px', fontSize: '0.72rem' }}>
                Query: <span style={{ color: '#ffffff' }}>"{searchResults.query || '*'}"</span> | Matches:{' '}
                <span style={{ color: '#22c55e', fontWeight: 700 }}>
                  {searchResults.gatheredFactsCount} facts
                </span>{' '}
                across {searchResults.matchedCommitsCount} commits
              </div>

              {searchResults.facts.length === 0 ? (
                <div style={{ color: '#ef4444', padding: '16px', textAlign: 'center' }}>
                  No matching facts found for query "{searchResults.query}".
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {searchResults.facts.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#09090b',
                        border: '1px solid #242429',
                        borderRadius: '4px',
                        padding: '10px 12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '4px',
                          fontSize: '0.68rem',
                          color: '#8e8e93',
                        }}
                      >
                        <span>
                          Topic: <strong style={{ color: '#ffffff' }}>{f.topic}</strong> (Branch: {f.branch})
                        </span>
                        <span style={{ color: '#22c55e' }}>Commit: {f.commitId.slice(0, 12)}</span>
                      </div>
                      <div style={{ color: '#ffffff', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{f.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#71717a', textAlign: 'center', padding: '24px' }}>
              Type a search query above and click "Search" to simulate Kiro's recall tool and inspect matching facts.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
