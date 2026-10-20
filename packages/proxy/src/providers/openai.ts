import { Request } from 'express';
import { ExtractedMessage, ProviderAdapter } from './base.js';

export class OpenAIAdapter implements ProviderAdapter {
  name = 'openai';

  extractMessages(body: any): ExtractedMessage[] {
    if (!body || !Array.isArray(body.messages)) {
      return [];
    }

    return body.messages.map((m: any) => {
      let contentStr = '';
      if (typeof m.content === 'string') {
        contentStr = m.content;
      } else if (Array.isArray(m.content)) {
        contentStr = m.content
          .map((part: any) => (typeof part === 'string' ? part : part.text || JSON.stringify(part)))
          .join('\n');
      } else {
        contentStr = JSON.stringify(m.content || '');
      }
      return {
        role: m.role || 'user',
        content: contentStr,
      };
    });
  }

  injectContext(body: any, reconstructedPrompt: string): any {
    const originalMessages = body.messages || [];

    if (!reconstructedPrompt) {
      return body;
    }

    // Retain developer/system system message if present, prepend context summary/memory
    const nonSystem = originalMessages.filter((m: any) => m.role !== 'system');
    const existingSystem = originalMessages.find((m: any) => m.role === 'system');

    const systemContent = existingSystem
      ? `${reconstructedPrompt}\n\n=== INSTRUCTIONS ===\n${existingSystem.content}`
      : reconstructedPrompt;

    return {
      ...body,
      messages: [{ role: 'system', content: systemContent }, ...nonSystem],
    };
  }

  getDownstreamUrl(): string {
    const baseUrl = process.env.OPENAI_BASE_URL || process.env.LOCAL_LLM_BASE_URL || 'https://api.openai.com/v1';
    const cleanBase = baseUrl.replace(/\/+$/, '');
    return `${cleanBase}/chat/completions`;
  }

  getHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (req.headers.authorization) {
      headers['authorization'] = req.headers.authorization;
    } else if (process.env.OPENAI_API_KEY) {
      headers['authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
    }

    return headers;
  }
}
