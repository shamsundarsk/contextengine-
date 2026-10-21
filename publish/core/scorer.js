"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SCORING_POLICY = void 0;
exports.cosineSimilarity = cosineSimilarity;
exports.computeEmbedding = computeEmbedding;
exports.classifyTextTier = classifyTextTier;
exports.scoreChunk = scoreChunk;
exports.DEFAULT_SCORING_POLICY = {
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
let featureExtractor = null;
let isExtractorLoading = false;
let extractorLoadFailed = false;
async function getExtractor() {
    if (featureExtractor)
        return featureExtractor;
    if (extractorLoadFailed)
        return null;
    if (isExtractorLoading) {
        let waitCount = 0;
        while (isExtractorLoading && waitCount < 20) {
            await new Promise((r) => setTimeout(r, 100));
            waitCount++;
            if (featureExtractor)
                return featureExtractor;
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
    }
    catch (err) {
        isExtractorLoading = false;
        extractorLoadFailed = true;
        console.warn('[Core:Scorer] Xenova/all-MiniLM-L6-v2 model unavailable, using term-overlap fallback for topic similarity.');
        return null;
    }
}
function cosineSimilarity(v1, v2) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < v1.length; i++) {
        dotProduct += v1[i] * v2[i];
        normA += v1[i] * v1[i];
        normB += v2[i] * v2[i];
    }
    if (normA === 0 || normB === 0)
        return 0;
    return Math.max(0, Math.min(1, dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))));
}
async function computeEmbedding(text) {
    const extractor = await getExtractor();
    if (!extractor)
        return null;
    try {
        const output = await extractor(text.slice(0, 512), { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }
    catch {
        return null;
    }
}
/**
 * Dual-Tier text categorization filter.
 * Rapidly classifies text into Transient Logs, Architectural Decisions, or Conversational filler.
 */
function classifyTextTier(content) {
    if (!content || !content.trim()) {
        return {
            tier: 'conversational',
            confidence: 1.0,
            reason: 'Empty or blank content.',
        };
    }
    // 1. Transient Logs Check (Ephemeral terminal dumps, stack traces, compiler output, test run logs, PIDs, timestamps)
    const isTransient = 
    // Test runner output (vitest, jest, mocha, pytest)
    /\b(FAIL|PASS|RUNS|Test Files|Tests:|Duration:|transforming \(\d+\)|modules transformed|npm ERR!|yarn run|exit code \d+)\b/.test(content) ||
        // Ephemeral stack traces and runtime frames
        /(?:at\s+[\w$./<>]+(?:\s+\(.*:\d+:\d+\)|:\d+:\d+)|node:internal\/|webpack:\/\/\/)/.test(content) ||
        // Compiler / build noise
        /\b(?:computing gzip size|rendering chunks|built in \d+ms|\[vite\]|\[webpack\]|rollup v)/i.test(content) ||
        // Process IDs, transient ports/memory logs, curl/ping outputs
        /\b(?:pid\s+\d+|PID:\s*\d+|listening on port \d{4,5}|GET \/[a-z0-9_/-]+ 200|POST \/[a-z0-9_/-]+ 200|status: 200 OK|latency: \d+ms)\b/i.test(content) ||
        // Terminal progress indicators or ANSI escape codes
        /(\[\s*={3,}\s*\]|\x1b\[[0-9;]*[a-zA-Z]|\b\d+%\s+\[\.*\])/.test(content) ||
        // Raw timestamped syslog or debug dumps
        /^\s*(?:\[?\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\]?)\s+(?:\[?(?:DEBUG|TRACE|INFO|VERBOSE)\]?)/im.test(content);
    // 2. Architectural Decisions Check (Permanent design decisions, schemas, configurations, API contracts)
    const isArchitectural = 
    // Explicit decision and architecture language
    /\b(?:decided to|decision:|we decided|agreed that|architecture|architectural|design choice|adr|rationale:)\b/i.test(content) ||
        // Schema definitions and database tables
        /\b(?:CREATE TABLE|ALTER TABLE|FOREIGN KEY|PRIMARY KEY|interface [A-Z]\w+|type [A-Z]\w+\s*=|schema:|enum [A-Z]\w+)\b/.test(content) ||
        // Environment configurations and permanent contracts
        /\b(?:process\.env\.[A-Z0-9_]+|[A-Z0-9_]{3,}=(?:https?:\/\/|[a-z0-9_/-]+)|export const [A-Z0-9_]+ =)\b/.test(content) ||
        // Concrete API endpoint specifications
        /\b(?:POST|GET|PUT|DELETE|PATCH)\s+\/(?:api|v1|v2|auth|users|sessions)\/[\w/{}-]+/i.test(content) ||
        // Permanent file path architecture specifications
        /\b(?:src\/(?:store|models|services|controllers|routes|core|utils)\/[\w-]+\.ts)\b/.test(content);
    if (isTransient && !isArchitectural) {
        return {
            tier: 'transient',
            confidence: 0.95,
            reason: 'Classified as Transient Log (terminal/test/compiler output, stack trace, or PID).',
        };
    }
    if (isArchitectural) {
        return {
            tier: 'architectural',
            confidence: 0.95,
            reason: 'Classified as Architectural Decision (permanent schema, configuration, contract, or design choice).',
        };
    }
    return {
        tier: 'conversational',
        confidence: 0.7,
        reason: 'Standard conversational or contextual turn.',
    };
}
/**
 * Calculates specificity sub-score based on numbers, code snippets, file paths, and decision keywords.
 */
function calculateSpecificityScore(content) {
    let scorePoints = 0;
    // 1. Code blocks, syntax, operators
    if (/```[\s\S]*?```/.test(content) ||
        /\b(const|let|function|class|import|interface|type|return|async|await)\b/.test(content) ||
        /[>=><]/.test(content)) {
        scorePoints += 0.25;
    }
    // 2. File paths, URLs, Env vars, Model identifiers
    if (/[\w\-./]+\/[\w\-./]+/.test(content) ||
        /[\w\-./]+\.[\w]{2,4}\b/.test(content) ||
        /https?:\/\/\S+/.test(content) ||
        /\b[A-Z0-9_]{3,}_[A-Z0-9_]+\b/.test(content)) {
        scorePoints += 0.25;
    }
    // 3. Numbers / Metrics / Offsets / Ports / Percentages
    if (/\b\d+(\.\d+)?%?\b/.test(content)) {
        scorePoints += 0.25;
    }
    // 4. Decision / Architectural / Feature language
    if (/\b(decided|agreed|will use|architecture|decision|feature|fix|fixed|must|schema|database|config|policy|endpoint)\b/i.test(content)) {
        scorePoints += 0.25;
    }
    return Math.min(1.0, scorePoints);
}
/**
 * Calculates reference frequency (keyword overlap ratio with surrounding context).
 */
function calculateReferenceFrequency(chunkContent, contextText) {
    if (!contextText)
        return 0.5;
    const words = chunkContent.toLowerCase().match(/\b[a-z0-9_-]{4,}\b/g) || [];
    if (words.length === 0)
        return 0.5;
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
async function calculateTopicMatch(chunkContent, contextText) {
    if (!contextText)
        return 0.5;
    const embChunk = await computeEmbedding(chunkContent);
    const embCtx = await computeEmbedding(contextText);
    if (embChunk && embCtx) {
        return cosineSimilarity(embChunk, embCtx);
    }
    // Fallback: Jaccard similarity word overlap
    const chunkWords = new Set(chunkContent.toLowerCase().match(/\b[a-z0-9_-]{3,}\b/g) || []);
    const ctxWords = new Set(contextText.toLowerCase().match(/\b[a-z0-9_-]{3,}\b/g) || []);
    if (chunkWords.size === 0 || ctxWords.size === 0)
        return 0.5;
    let intersection = 0;
    for (const w of chunkWords) {
        if (ctxWords.has(w))
            intersection++;
    }
    const union = new Set([...chunkWords, ...ctxWords]).size;
    return union === 0 ? 0.5 : intersection / union;
}
/**
 * Scores a chunk of context and assigns triage label ('keep_verbatim' | 'summarize' | 'discard').
 * Utilizes the Dual-Tier Text Categorization Filter to prune transient logs while locking architectural decisions.
 */
async function scoreChunk(chunkContent, options = {}) {
    const policy = options.policy || exports.DEFAULT_SCORING_POLICY;
    const contextText = options.contextText || '';
    const recency = options.recencyNormalized ?? 1.0;
    // 1. Dual-Tier Classification
    const classification = classifyTextTier(chunkContent);
    // If classified as transient log, NEVER keep verbatim (prunes ephemeral debug/compiler/test garbage)
    if (classification.tier === 'transient') {
        return {
            label: 'discard',
            score: 0.1,
            reason: `[Dual-Tier Filter: Transient Log] ${classification.reason}`,
            tier: 'transient',
            subScores: {
                recency,
                referenceFrequency: 0.1,
                specificity: 0.1,
                topicMatch: 0.1,
            },
        };
    }
    // If classified as permanent architectural decision, lock into keep_verbatim
    if (classification.tier === 'architectural') {
        return {
            label: 'keep_verbatim',
            score: 0.95,
            reason: `[Dual-Tier Filter: Architectural Decision] ${classification.reason}`,
            tier: 'architectural',
            subScores: {
                recency,
                referenceFrequency: 0.9,
                specificity: 1.0,
                topicMatch: 0.9,
            },
        };
    }
    // 2. Standard Scoring for conversational content
    const referenceFrequency = calculateReferenceFrequency(chunkContent, contextText);
    const specificity = calculateSpecificityScore(chunkContent);
    const topicMatch = await calculateTopicMatch(chunkContent, contextText);
    const subScores = {
        recency,
        referenceFrequency,
        specificity,
        topicMatch,
    };
    const { weights, thresholds } = policy;
    const totalWeight = weights.recency + weights.referenceFrequency + weights.specificity + weights.topicMatch;
    const score = (recency * weights.recency +
        referenceFrequency * weights.referenceFrequency +
        specificity * weights.specificity +
        topicMatch * weights.topicMatch) /
        (totalWeight || 1);
    let label = 'discard';
    let reason = '';
    if (score >= thresholds.keepVerbatim && specificity >= 0.5) {
        label = 'keep_verbatim';
        reason = `High score (${score.toFixed(2)} >= ${thresholds.keepVerbatim}) and high specificity (${specificity.toFixed(2)}). Preserved verbatim.`;
    }
    else if (score >= thresholds.summarize) {
        label = 'summarize';
        reason = `Moderate score (${score.toFixed(2)} >= ${thresholds.summarize}). Context suitable for compression.`;
    }
    else {
        label = 'discard';
        reason = `Low score (${score.toFixed(2)} < ${thresholds.summarize}). Conversational filler discarded.`;
    }
    return {
        label,
        score,
        reason,
        tier: 'conversational',
        subScores,
    };
}
//# sourceMappingURL=scorer.js.map