export type TriageLabel = 'keep_verbatim' | 'summarize' | 'discard';

export interface Chunk {
  id: string;
  commit_id: string;
  content: string;
  label: TriageLabel;
  source_ref?: string;
  token_count?: number;
}

export interface Commit {
  id: string;
  parent_id: string | null;
  session_id: string;
  branch: string;
  timestamp: number;
  topic_label: string;
  reason_log: string;
  chunks?: Chunk[];
}

export interface Branch {
  name: string;
  session_id: string;
  head_commit_id: string | null;
}

export interface Conflict {
  id: string;
  session_id: string;
  branch_a: string;
  branch_b: string;
  topic_label: string;
  description: string;
  resolved: boolean;
  timestamp: number;
}

export interface ScoringWeights {
  recency: number;
  referenceFrequency: number;
  specificity: number;
  topicMatch: number;
}

export interface ScoringThresholds {
  keepVerbatim: number;
  summarize: number;
}

export interface ScoringPolicy {
  weights: ScoringWeights;
  thresholds: ScoringThresholds;
}

export interface SubScores {
  recency: number;
  referenceFrequency: number;
  specificity: number;
  topicMatch: number;
}

export interface ScoringResult {
  label: TriageLabel;
  score: number;
  reason: string;
  subScores: SubScores;
}

export interface ReconstructedContext {
  keptVerbatim: Chunk[];
  summaries: string[];
  fullPromptText: string;
  rawTokenCount: number;
  reconstructedTokenCount: number;
  tokensSavedPct: number;
  activeBranch: string;
  headCommitId: string | null;
}

export interface SessionStats {
  sessionId: string;
  totalCommits: number;
  activeBranch: string;
  totalOriginalTokens: number;
  totalOptimizedTokens: number;
  tokensSavedPct: number;
  estimatedCostSavedUSD: number;
  keptVerbatimCount: number;
  summarizedCount: number;
  discardedCount: number;
  conflictCount: number;
}

export interface SessionSummary {
  sessionId: string;
  commitCount: number;
  lastActive: number;
  activeBranch: string;
}
