import crypto from 'crypto';
import { getDatabase } from './store/db.js';
import { Chunk } from './store/types.js';

export type SummarizerSampler = (prompt: string, systemPrompt?: string) => Promise<string | null>;

let globalSampler: SummarizerSampler | null = null;

export function registerSampler(sampler: SummarizerSampler | null): void {
  globalSampler = sampler;
}

export function getRegisteredSampler(): SummarizerSampler | null {
  return globalSampler;
}

/**
 * Generates SHA-256 hash key for input chunks.
 */
function hashChunks(chunks: Chunk[]): string {
  const combined = chunks.map((c) => `${c.id}:${c.content}`).join('||');
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Fallback extractive summary when LLM API keys are not provided or API calls fail.
 */
export function fallbackSummarize(chunks: Chunk[]): string {
  const text = chunks.map((c) => c.content).join('\n');
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 2) {
    return text;
  }

  // Pick first sentence, last sentence, and any sentence with key action words or concrete values/numbers
  const keySentences: string[] = [sentences[0]];
  for (let i = 1; i < sentences.length - 1; i++) {
    if (
      /\b(decided|must|created|updated|error|fix|used|endpoint|select|add|remove|config|port|database|model|priority|override|shadow|tools)\b/i.test(
        sentences[i]
      ) ||
      /\d+/.test(sentences[i]) ||
      /[=><:]/.test(sentences[i])
    ) {
      if (!keySentences.includes(sentences[i])) {
        keySentences.push(sentences[i]);
      }
    }
  }
  if (!keySentences.includes(sentences[sentences.length - 1])) {
    keySentences.push(sentences[sentences.length - 1]);
  }

  return keySentences.join(' ');
}

/**
 * Summarizes an array of 'summarize'-tier chunks using host MCP Sampling, cheap model, or cached result.
 */
export async function summarize(chunks: Chunk[], modelOverride?: string): Promise<string> {
  if (!chunks || chunks.length === 0) return '';

  const hashKey = hashChunks(chunks);
  const db = getDatabase();

  // 1. Check cache first
  try {
    const cachedRow = db.prepare('SELECT summary FROM summary_cache WHERE hash = ?').get(hashKey) as { summary: string } | undefined;
    if (cachedRow?.summary) {
      return cachedRow.summary;
    }
  } catch (err) {
    // Cache lookup non-fatal
  }

  const model = modelOverride || process.env.SUMMARIZER_MODEL || 'gpt-4o-mini';
  const combinedContent = chunks.map((c) => c.content).join('\n---\n');
  let summaryResult = '';

  const systemPrompt =
    'Summarize the following context into 1-2 concise sentences. CRITICAL REQUIREMENT: You MUST preserve all specific named values, numbers, ports, identifiers, model names, environment variables, priority orders, and tool names verbatim. Do not omit or generalize concrete figures or technical terms.';

  // 2. Native MCP Sampling via host AI (zero external API keys required)
  if (globalSampler) {
    try {
      const sampledText = await globalSampler(combinedContent, systemPrompt);
      if (sampledText && sampledText.trim()) {
        summaryResult = sampledText.trim();
      }
    } catch (err: any) {
      console.warn('[Core:Summarizer] Native MCP Sampling returned an error, attempting alternative:', err.message);
    }
  }

  // 3. Attempt external API Call if keys exist in environment
  if (!summaryResult) {
    try {
      if (model.includes('claude') && process.env.ANTHROPIC_API_KEY) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const resp = await client.messages.create({
          model,
          max_tokens: 250,
          system: systemPrompt,
          messages: [{ role: 'user', content: combinedContent }],
        });
        const firstBlock = resp.content[0];
        if (firstBlock && firstBlock.type === 'text') {
          summaryResult = firstBlock.text.trim();
        }
      } else if (process.env.OPENAI_API_KEY) {
        const endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const resp = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              { role: 'user', content: combinedContent },
            ],
            max_tokens: 250,
          }),
        });
        if (resp.ok) {
          const json = await resp.json();
          summaryResult = json.choices?.[0]?.message?.content?.trim();
        }
      }
    } catch (err) {
      // Non-fatal
    }
  }

  // 4. Zero-dependency extractive summary fallback
  if (!summaryResult) {
    summaryResult = fallbackSummarize(chunks);
  }

  // 5. Cache summary result
  try {
    db.prepare('INSERT OR REPLACE INTO summary_cache (hash, summary, timestamp) VALUES (?, ?, ?)').run(
      hashKey,
      summaryResult,
      Date.now()
    );
  } catch (err) {
    // Non-fatal
  }

  return summaryResult;
}

