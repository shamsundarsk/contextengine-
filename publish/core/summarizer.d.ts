import { Chunk } from './store/types.js';
export type SummarizerSampler = (prompt: string, systemPrompt?: string) => Promise<string | null>;
export declare function registerSampler(sampler: SummarizerSampler | null): void;
export declare function getRegisteredSampler(): SummarizerSampler | null;
/**
 * Fallback extractive summary when LLM API keys are not provided or API calls fail.
 */
export declare function fallbackSummarize(chunks: Chunk[]): string;
/**
 * Summarizes an array of 'summarize'-tier chunks using host MCP Sampling, cheap model, or cached result.
 */
export declare function summarize(chunks: Chunk[], modelOverride?: string): Promise<string>;
//# sourceMappingURL=summarizer.d.ts.map