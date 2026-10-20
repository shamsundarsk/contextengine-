import { Request, Response } from 'express';
import { getActiveBranch, commit, scoreChunk, reconstructContext, countTokens, getStats } from '@context-engine/core';
import { ProviderAdapter } from './providers/base.js';
import { resolveSessionIdWithMethod } from './session.js';

export async function forwardRequest(
  req: Request,
  res: Response,
  adapter: ProviderAdapter
): Promise<void> {
  const { sessionId, method } = resolveSessionIdWithMethod(req);
  const activeBranch = getActiveBranch(sessionId);
  const messages = adapter.extractMessages(req.body);
  const isShadowMode = process.env.SHADOW_MODE === 'true' || process.env.SHADOW_MODE === '1';

  const perMsgTokens: number[] = [];
  let incomingTotal = 0;

  // 1. Automatic Triage of incoming request messages
  if (messages.length > 0) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user') || messages[messages.length - 1];
    const fullContextStr = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    const triagedChunks: { content: string; label: 'keep_verbatim' | 'summarize' | 'discard'; source_ref?: string }[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const tokCount = countTokens(msg.content);
      perMsgTokens.push(tokCount);
      incomingTotal += tokCount;

      const recency = (i + 1) / messages.length;
      const scoreRes = await scoreChunk(msg.content, {
        recencyNormalized: recency,
        contextText: fullContextStr,
      });

      triagedChunks.push({
        content: `[${msg.role.toUpperCase()}]: ${msg.content}`,
        label: scoreRes.label,
        source_ref: `proxy_${adapter.name}_msg_${i}`,
      });
    }

    const topicSnippet = lastUserMsg.content.slice(0, 40).replace(/[\r\n]+/g, ' ') || 'Proxy Conversation Turn';

    commit(
      sessionId,
      activeBranch.name,
      topicSnippet,
      `Auto-triaged ${messages.length} messages via proxy${isShadowMode ? ' (SHADOW MODE)' : ''}`,
      triagedChunks
    );
  }

  // 2. Reconstruct bounded context
  const reconstructed = await reconstructContext(sessionId);
  const sessionStats = getStats(sessionId);
  const delta = incomingTotal - reconstructed.reconstructedTokenCount;
  const deltaPct = incomingTotal > 0 ? ((delta / incomingTotal) * 100).toFixed(1) : '0.0';

  // 3. Log request details
  if (isShadowMode) {
    console.log(
      `[Proxy Log: SHADOW MODE] Session: ${sessionId} (via ${method}) | Incoming payload: ${incomingTotal} tokens | Bounded context: ${reconstructed.reconstructedTokenCount} tokens | Delta (original - bounded): ${delta > 0 ? '+' : ''}${delta} tokens (${deltaPct}%)`
    );
  } else {
    console.log(
      `[Proxy Log] Session: ${sessionId} (via ${method}) | Per-msg tokens: [${perMsgTokens.join(
        ', '
      )}] | Incoming total: ${incomingTotal} | Forwarded total: ${reconstructed.reconstructedTokenCount} | Session running total: ${sessionStats.totalOriginalTokens}`
    );
  }

  // 4. In Shadow Mode, forward ORIGINAL unmodified payload; otherwise inject reconstructed prompt
  const modifiedBody = isShadowMode ? req.body : adapter.injectContext(req.body, reconstructed.fullPromptText);
  const targetUrl = adapter.getDownstreamUrl();
  const targetHeaders = adapter.getHeaders(req);

  try {
    const isStream = Boolean(req.body?.stream);

    const downstreamResp = await fetch(targetUrl, {
      method: 'POST',
      headers: targetHeaders,
      body: JSON.stringify(modifiedBody),
    });

    res.status(downstreamResp.status);

    for (const [key, value] of downstreamResp.headers.entries()) {
      if (
        key.toLowerCase() === 'transfer-encoding' ||
        key.toLowerCase() === 'content-length' ||
        key.toLowerCase() === 'content-encoding'
      ) {
        continue;
      }
      res.setHeader(key, value);
    }

    if (isStream && downstreamResp.body) {
      const reader = (downstreamResp.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      const text = await downstreamResp.text();
      res.send(text);
    }
  } catch (err: any) {
    console.error(`[Proxy Forwarder Error] Failed to contact ${targetUrl}:`, err.message);
    res.status(502).json({
      error: {
        message: `Context Engine Proxy Error: Failed to reach downstream model at ${targetUrl}. ${err.message}`,
        type: 'proxy_error',
      },
    });
  }
}
