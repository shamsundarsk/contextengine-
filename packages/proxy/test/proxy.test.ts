import { describe, it, expect } from 'vitest';
import { OpenAIAdapter } from '../src/providers/openai.js';
import { AnthropicAdapter } from '../src/providers/anthropic.js';
import { resolveSessionId } from '../src/session.js';

describe('Proxy Provider Adapters & Session Resolution', () => {
  it('extracts messages correctly in OpenAIAdapter', () => {
    const adapter = new OpenAIAdapter();
    const body = {
      messages: [
        { role: 'user', content: 'Hello OpenAI' },
        { role: 'assistant', content: 'Hi there' },
      ],
    };

    const messages = adapter.extractMessages(body);
    expect(messages.length).toBe(2);
    expect(messages[0].content).toBe('Hello OpenAI');
  });

  it('injects context prompt into system message in OpenAIAdapter', () => {
    const adapter = new OpenAIAdapter();
    const body = {
      messages: [{ role: 'user', content: 'What is the DB schema?' }],
    };

    const injected = adapter.injectContext(body, '=== CONTEXT SUMMARY ===\nUsing SQLite DB');
    expect(injected.messages.length).toBe(2);
    expect(injected.messages[0].role).toBe('system');
    expect(injected.messages[0].content).toContain('Using SQLite DB');
  });

  it('injects system context prompt in AnthropicAdapter', () => {
    const adapter = new AnthropicAdapter();
    const body = {
      system: 'Existing system prompt',
      messages: [{ role: 'user', content: 'Hello Claude' }],
    };

    const injected = adapter.injectContext(body, '=== CONTEXT SUMMARY ===\nMemory active');
    expect(injected.system).toContain('=== CONTEXT SUMMARY ===');
    expect(injected.system).toContain('Existing system prompt');
  });

  it('resolves session ID from request headers', () => {
    const req1: any = { headers: { 'x-session-id': 'session_abc' }, query: {} };
    expect(resolveSessionId(req1)).toBe('session_abc');

    const req2: any = { headers: {}, query: { session_id: 'session_123' } };
    expect(resolveSessionId(req2)).toBe('session_123');

    const reqDefault: any = { headers: {}, query: {} };
    expect(resolveSessionId(reqDefault)).toMatch(/^session_[a-f0-9]+/);
  });
});
