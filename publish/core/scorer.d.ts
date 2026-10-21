import { LogTier, ScoringPolicy, ScoringResult } from './store/types.js';
export declare const DEFAULT_SCORING_POLICY: ScoringPolicy;
export declare function cosineSimilarity(v1: number[], v2: number[]): number;
export declare function computeEmbedding(text: string): Promise<number[] | null>;
export interface TextTierClassification {
    tier: LogTier;
    confidence: number;
    reason: string;
}
/**
 * Dual-Tier text categorization filter.
 * Rapidly classifies text into Transient Logs, Architectural Decisions, or Conversational filler.
 */
export declare function classifyTextTier(content: string): TextTierClassification;
export interface ScoreChunkOptions {
    recencyNormalized?: number;
    contextText?: string;
    policy?: ScoringPolicy;
    turnAge?: number;
}
/**
 * Scores a chunk of context and assigns triage label ('keep_verbatim' | 'summarize' | 'discard').
 * Utilizes the Dual-Tier Text Categorization Filter to prune transient logs while locking architectural decisions.
 */
export declare function scoreChunk(chunkContent: string, options?: ScoreChunkOptions): Promise<ScoringResult>;
//# sourceMappingURL=scorer.d.ts.map