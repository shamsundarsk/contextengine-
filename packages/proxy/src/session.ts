import { Request } from 'express';
import crypto from 'crypto';

export interface ResolvedSession {
  sessionId: string;
  method: 'header' | 'metadata' | 'query' | 'hash_fallback';
}

export function resolveSessionIdWithMethod(req: Request): ResolvedSession {
  // 1. Explicit Header
  const headerSession =
    req.headers['x-session-id'] ||
    req.headers['x-context-engine-session'] ||
    req.headers['session-id'];

  if (typeof headerSession === 'string' && headerSession.trim()) {
    return { sessionId: headerSession.trim(), method: 'header' };
  }
  if (Array.isArray(headerSession) && headerSession[0]) {
    return { sessionId: headerSession[0].trim(), method: 'header' };
  }

  // 2. Body Metadata Field
  const metaUserId = req.body?.metadata?.user_id || req.body?.metadata?.session_id || req.body?.user;
  if (typeof metaUserId === 'string' && metaUserId.trim()) {
    return { sessionId: `user_${metaUserId.trim()}`, method: 'metadata' };
  }

  // 3. Query Param
  const querySession = req.query.session_id || req.query.sessionId;
  if (typeof querySession === 'string' && querySession.trim()) {
    return { sessionId: querySession.trim(), method: 'query' };
  }

  // 4. Hash Fallback (system prompt + first user message)
  const systemPrompt = typeof req.body?.system === 'string' ? req.body.system : '';
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const firstUserMsg = messages.find((m: any) => m.role === 'user')?.content || '';
  const combinedSeed = `${systemPrompt}||${typeof firstUserMsg === 'string' ? firstUserMsg : JSON.stringify(firstUserMsg)}`;

  const hash = crypto.createHash('sha256').update(combinedSeed || 'fallback_session').digest('hex').slice(0, 16);
  return { sessionId: `session_${hash}`, method: 'hash_fallback' };
}

export function resolveSessionId(req: Request): string {
  return resolveSessionIdWithMethod(req).sessionId;
}
