import { Request, Response } from 'express';

export interface ExtractedMessage {
  role: string;
  content: string;
}

export interface ProviderAdapter {
  name: string;
  extractMessages(body: any): ExtractedMessage[];
  injectContext(body: any, reconstructedPrompt: string): any;
  getDownstreamUrl(): string;
  getHeaders(req: Request): Record<string, string>;
}
