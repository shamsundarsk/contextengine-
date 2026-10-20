import { ScoringPolicy, ScoringResult, SubScores, TriageLabel } from './store/types.js';

export const DEFAULT_SCORING_POLICY: ScoringPolicy = {
  weights: {
    recency: 0.25,
    referenceFrequency: 0.25,
    specificity: 0.25,
    topicMatch: 0.25,
  },
  thresholds: {
    keepVerbatim: 0.65,
    summarize: 0.35,
  },
};

let featureExtractor: any = null;
let isExtractorLoading = false;
let extractorLoadFailed = false;

async function getExtractor() {
  if (featureExtractor) return featureExtractor;
  if (extractorLoadFailed) return null;
  if (isExtractorLoading) {
    // Wait briefly if loading in progress
    let waitCount = 0;
    while (isExtractorLoading && waitCount < 20) {
      await new Promise((r) => setTimeout(r, 100));
      waitCount++;
      if (featureExtractor) return featureExtractor;
    }
  }

  try {
    isExtractorLoading = true;
    const { pipeline } = await import('@xenova/transformers');
    featureExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });
    isExtractorLoading = false;
    return featureExtractor;
  } catch (err) {
    isExtractorLoading = false;
    extractorLoadFailed = true;
    console.warn('[Core:Scorer] Xenova/all-MiniLM-L6-v2 model unavailable, using term-overlap fallback for topic similarity.');
    return null;
  }
}

export function cosineSimilarity(v1: number[], v2: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, Math.min(1, dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))));
}

export async function computeEmbedding(text: string): Promise<number[] | null> {
  const extractor = await getExtractor();
  if (!extractor) return null;
  try {
    const output = await extractor(text.slice(0, 512), { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch {
    return null;
  }
}

/**
 * Calculates specificity sub-score based on numbers, code snippets, file paths, and decision keywords.
 */
function calculateSpecificityScore(content: string): number {
  let scorePoints = 0;

  // 1. Code blocks, syntax, operators
  if (
    /```[\s\S]*?```/.test(content) ||
    /\b(const|let|function|class|import|interface|type|return|async|await)\b/.test(content) ||
    /[>=><]/.test(content)
  ) {
    scorePoints += 0.25;
  }

  // 2. File paths, URLs, Env vars, Model identifiers
  if (
    /[\w\-./]+\/[\w\-./]+/.test(content) ||
    /[\w\-./]+\.[\w]{2,4}\b/.test(content) ||
    /https?:\/\/\S+/.test(content) ||
    /\b[A-Z0-9_]{3,}_[A-Z0-9_]+\b/.test(content)
  ) {
    scorePoints += 0.25;
  }

  // 3. Numbers / Metrics / Offsets / Ports / Percentages
  if (/\b\d+(\.\d+)?%?\b/.test(content)) {
    scorePoints += 0.25;
  }

  // 4. Decision / Architectural / Feature language
  if (
    /\b(decided|agreed|will use|architecture|decision|feature|fix|fixed|must|error|bug|endpoint|spec|database|proxy|mcp|config|policy|priority|schema|tool|tools|mode|override|shadow|session|tokenizer|engine|model|port)\b/i.test(
      content
    )
  ) {
    scorePoints += 0.25;
  }

  // 5. Concrete named identifiers, lists & key values
  if (
    /\b(sqlite|better-sqlite3|xenova|miniLM|gpt-tokenizer|ink|react|ollama|vitest|sha-256|gitignore|statsbar|branchlist|committimeline|conflictalert|promotechunk|reason_log|hash_fallback|recall|commit|branch|merge|checkout)\b/i.test(
      content
    )
  ) {
    scorePoints += 0.25;
  }

  return Math.min(1.0, scorePoints);
}

/**
 * Calculates reference frequency (keyword overlap ratio with surrounding context).
 */
function calculateReferenceFrequency(chunkContent: string, contextText: string): number {
  if (!contextText) return 0.5;

  const words = chunkContent.toLowerCase().match(/\b[a-z0-9_-]{4,}\b/g) || [];
  if (words.length === 0) return 0.5;

  const contextLower = contextText.toLowerCase();
  let matchCount = 0;

  for (const word of words) {
    if (contextLower.includes(word)) {
      matchCount++;
    }
  }

  return Math.min(1.0, matchCount / words.length);
}

/**
 * Computes topic match similarity between chunk and overall context.
 */
async function calculateTopicMatch(chunkContent: string, contextText: string): Promise<number> {
  if (!contextText) return 0.5;

  const embChunk = await computeEmbedding(chunkContent);
  const embCtx = await computeEmbedding(contextText);

  if (embChunk && embCtx) {
    return cosineSimilarity(embChunk, embCtx);
  }

  // Fallback: Jaccard similarity word overlap
  const chunkWords = new Set(chunkContent.toLowerCase().match(/\b[a-z0-9_-]{3,}\b/g) || []);
  const ctxWords = new Set(contextText.toLowerCase().match(/\b[a-z0-9_-]{3,}\b/g) || []);

  if (chunkWords.size === 0 || ctxWords.size === 0) return 0.5;

  let intersection = 0;
  for (const w of chunkWords) {
    if (ctxWords.has(w)) intersection++;
  }

  const union = new Set([...chunkWords, ...ctxWords]).size;
  return union === 0 ? 0.5 : intersection / union;
}

export interface ScoreChunkOptions {
  recencyNormalized?: number; // 0.0 (oldest) to 1.0 (newest)
  contextText?: string;
  policy?: ScoringPolicy;
}

/**
 * Scores a chunk of context and assigns triage label ('keep_verbatim' | 'summarize' | 'discard').
 */
export async function scoreChunk(
  chunkContent: string,
  options: ScoreChunkOptions = {}
): Promise<ScoringResult> {
  const policy = options.policy || DEFAULT_SCORING_POLICY;
  const contextText = options.contextText || '';
  const recency = options.recencyNormalized ?? 1.0;

  const referenceFrequency = calculateReferenceFrequency(chunkContent, contextText);
  const specificity = calculateSpecificityScore(chunkContent);
  const topicMatch = await calculateTopicMatch(chunkContent, contextText);

  const subScores: SubScores = {
    recency,
    referenceFrequency,
    specificity,
    topicMatch,
  };

  const { weights, thresholds } = policy;
  const totalWeight = weights.recency + weights.referenceFrequency + weights.specificity + weights.topicMatch;

  const score =
    (recency * weights.recency +
      referenceFrequency * weights.referenceFrequency +
      specificity * weights.specificity +
      topicMatch * weights.topicMatch) /
    (totalWeight || 1);

  let label: TriageLabel = 'discard';
  let reason = '';

  // Hard override: If chunk is highly specific (contains numbers, concrete identifiers, config/architecture decisions),
  // force keep_verbatim regardless of age/recency.
  if (specificity >= 0.45) {
    label = 'keep_verbatim';
    reason = `Hard override: High specificity score (${specificity.toFixed(
      2
    )} >= 0.45). Specific architectural decisions and concrete values must be preserved verbatim regardless of turn age.`;
  } else if (score >= thresholds.keepVerbatim) {
    label = 'keep_verbatim';
    reason = `High score (${score.toFixed(2)} >= ${thresholds.keepVerbatim}). High specificity (${specificity.toFixed(
      2
    )}) or strong topic relevance (${topicMatch.toFixed(2)}).`;
  } else if (score >= thresholds.summarize) {
    label = 'summarize';
    reason = `Moderate score (${score.toFixed(2)} >= ${thresholds.summarize}). Contains useful context that can be compressed.`;
  } else {
    label = 'discard';
    reason = `Low score (${score.toFixed(2)} < ${thresholds.summarize}). Low reference frequency and specificity.`;
  }

  return {
    label,
    score,
    reason,
    subScores,
  };
}
