"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countTokens = countTokens;
exports.countTotalTokens = countTotalTokens;
const gpt_tokenizer_1 = require("gpt-tokenizer");
/**
 * Counts token usage for a given text snippet and model name.
 * For OpenAI models, uses `gpt-tokenizer`.
 * For Anthropic models (e.g. `claude-3-5-sonnet`, `claude-3-haiku`), applies a 10% fudge factor
 * over the gpt-tokenizer estimate as documented.
 */
function countTokens(text, model = 'gpt-4o') {
    if (!text)
        return 0;
    const baseCount = (0, gpt_tokenizer_1.encode)(text).length;
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
function countTotalTokens(texts, model = 'gpt-4o') {
    return texts.reduce((sum, text) => sum + countTokens(text, model), 0);
}
//# sourceMappingURL=tokenizer.js.map