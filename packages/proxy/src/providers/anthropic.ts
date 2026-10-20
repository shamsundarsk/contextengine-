import { Request } from 'express';
import { ExtractedMessage, ProviderAdapter } from './base.js';

export class AnthropicAdapter implements ProviderAdapter {
  name = 'anthropic';

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
      }
      return {
        role: m.role || 'user',
        content: contentStr,
      };
    });
  }

  injectContext(body: any, reconstructedPrompt: string): any {
    if (!reconstructedPrompt) {
      return body;
    }

    const existingSystem = body.system || '';
    const systemContent = existingSystem
      ? `${reconstructedPrompt}\n\n=== SYSTEM INSTRUCTIONS ===\n${existingSystem}`
      : reconstructedPrompt;

    return {
      ...body,
      system: systemContent,
    };
  }

  getDownstreamUrl(): string {
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const cleanBase = baseUrl.replace(/\/+$/, '');
    return `${cleanBase}/v1/messages`;
  }

  getHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': (req.headers['anthropic-version'] as string) || '2023-06-01',
    };

    if (req.headers['x-api-key']) {
      headers['x-api-key'] = req.headers['x-api-key'] as string;
    } else if (process.env.ANTHROPIC_API_KEY) {
      headers['x-api-key'] = process.env.ANTHROPIC_API_KEY;
    }

    return headers;
  }
}
