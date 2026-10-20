import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { scoreChunk } from '@context-engine/core';
import { OpenAIAdapter } from './providers/openai.js';
import { AnthropicAdapter } from './providers/anthropic.js';
import { forwardRequest } from './forwarder.js';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const app = express();
const port = Number(process.env.PROXY_PORT || 4000);
const host = process.env.HOST || '127.0.0.1';

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const openAIAdapter = new OpenAIAdapter();
const anthropicAdapter = new AnthropicAdapter();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Context Engine Proxy',
    localLlmBaseUrl: process.env.LOCAL_LLM_BASE_URL || 'not_set',
    openAIBaseUrl: process.env.OPENAI_BASE_URL || 'not_set',
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || 'not_set',
  });
});

app.post('/v1/chat/completions', (req, res) => {
  forwardRequest(req, res, openAIAdapter);
});

app.post('/v1/messages', (req, res) => {
  forwardRequest(req, res, anthropicAdapter);
});

async function startServer() {
  console.log('[Context Engine Proxy] Warming local embedding model (Xenova/all-MiniLM-L6-v2)...');
  const warmStart = performance.now();
  try {
    await scoreChunk('Warmup prompt for embedding pipeline', { contextText: 'Warmup context' });
    const warmDuration = (performance.now() - warmStart).toFixed(2);
    console.log(`[Context Engine Proxy] Embedding model warmed up in ${warmDuration} ms.`);
  } catch (err) {
    console.warn('[Context Engine Proxy] Model warmup warning:', err);
  }

  app.listen(port, host, () => {
    console.log(`[Context Engine Proxy] Listening on http://${host}:${port}`);
    console.log(` - Downstream target base URL: ${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}`);
    console.log(` - OpenAI / Groq endpoint:     http://${host}:${port}/v1/chat/completions`);
    console.log(` - Anthropic endpoint:         http://${host}:${port}/v1/messages`);
  });
}

startServer();

export default app;
