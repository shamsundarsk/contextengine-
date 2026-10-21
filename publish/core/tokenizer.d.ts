/**
 * Counts token usage for a given text snippet and model name.
 * For OpenAI models, uses `gpt-tokenizer`.
 * For Anthropic models (e.g. `claude-3-5-sonnet`, `claude-3-haiku`), applies a 10% fudge factor
 * over the gpt-tokenizer estimate as documented.
 */
export declare function countTokens(text: string, model?: string): number;
/**
 * Counts total tokens across an array of text snippets.
 */
export declare function countTotalTokens(texts: string[], model?: string): number;
//# sourceMappingURL=tokenizer.d.ts.map