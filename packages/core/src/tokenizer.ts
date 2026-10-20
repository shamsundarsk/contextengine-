import { encode } from 'gpt-tokenizer';

/**
 * Counts token usage for a given text snippet and model name.
 * For OpenAI models, uses `gpt-tokenizer`.
 * For Anthropic models (e.g. `claude-3-5-sonnet`, `claude-3-haiku`), applies a 10% fudge factor
 * over the gpt-tokenizer estimate as documented.
 */
export function countTokens(text: string, model: string = 'gpt-4o'): number {
  if (!text) return 0;
  
  const baseCount = encode(text).length;
  const isAnthropic = model.toLowerCase().includes('claude') || model.toLowerCase().startsWith('anthropic');
  
  if (isAnthropic) {
    // Documented 10% fudge factor estimate for Anthropic models
    return Math.ceil(baseCount * 1.1);
  }
  
  return baseCount;
}

/**
 * Counts total tokens across an array of text snippets.
 */
export function countTotalTokens(texts: string[], model: string = 'gpt-4o'): number {
  return texts.reduce((sum, text) => sum + countTokens(text, model), 0);
}
