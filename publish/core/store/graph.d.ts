import { Branch, Commit, Conflict, ReconstructedContext, SessionStats, SessionSummary, TriageLabel, LogTier, OverrideNodeOptions } from './types.js';
export declare function getAllSessions(): SessionSummary[];
export declare function getBranches(sessionId: string): Branch[];
export declare function getActiveBranch(sessionId: string): Branch;
export declare function getCommit(commitId: string): Commit | null;
export declare function getCommits(sessionId: string, branchName?: string): Commit[];
export declare function commit(sessionId: string, branchName: string, topicLabel: string, reasonLog: string, chunks: {
    content: string;
    label: TriageLabel;
    tier?: LogTier;
    turn?: number;
    source_ref?: string;
}[], parentId?: string, turn?: number): Commit;
/**
 * Prunes transient logs older than maxTurnsToKeep (default: 3 turns) to prevent filler accumulation.
 */
export declare function pruneTransientLogs(sessionId: string, currentTurn?: number, maxTurnsToKeep?: number): number;
/**
 * Forcibly targets an exact commit node in the history graph and updates its text content / prunes debug junk.
 */
export declare function overrideMemoryNode(commitId: string, options: OverrideNodeOptions): Commit;
/**
 * Builds a clean, visual markdown text graph tree of branches, commits, and memory states straight to the chat view.
 */
export declare function getContextTree(sessionId?: string): string;
export declare function branch(sessionId: string, name: string, fromCommitId?: string): Branch;
export declare function checkout(sessionId: string, commitId: string): void;
export declare function merge(sessionId: string, sourceBranchName: string, targetBranchName?: string): {
    success: boolean;
    conflict?: Conflict;
    mergedCommitId?: string;
};
export declare function getConflicts(sessionId?: string): Conflict[];
export declare function resolveConflict(conflictId: string): void;
export declare function promoteChunk(chunkId: string, newLabel: TriageLabel, overrideBy?: string): Commit;
export declare function reconstructContext(sessionId: string): Promise<ReconstructedContext>;
export declare function getStats(sessionId: string): SessionStats;
//# sourceMappingURL=graph.d.ts.map