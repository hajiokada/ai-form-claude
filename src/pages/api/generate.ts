import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  assertStartupEnv,
  availableModelIds,
  effectiveAllowedModels,
  getApp,
  getModel,
} from '@/lib/config';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
  maxDuration: 60,
};

const MAX_INPUT = 100_000;

const BodySchema = z.object({
  slug: z.string(),
  systemPrompt: z.string().max(MAX_INPUT),
  userPrompt: z.string().min(1).max(MAX_INPUT),
  modelId: z.string(),
  password: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const reqId = Date.now().toString(36);
  const log = (icon: string, label: string, detail?: string) =>
    console.log(`${icon} [generate:${reqId}] ${label}${detail ? ` — ${detail}` : ''}`);

  log('🔵', 'START', `method=${req.method}`);

  if (req.method !== 'POST') {
    log('🔴', 'REJECT', '405 Method Not Allowed');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    assertStartupEnv();
  } catch (e: any) {
    log('🔴', 'ENV ERROR', e.message);
    res.status(500).json({ error: e.message });
    return;
  }
  log('🟢', 'ENV OK');

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    log('🔴', 'VALIDATION FAILED', JSON.stringify(parsed.error.flatten()));
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }
  const { slug, systemPrompt, userPrompt, modelId, password } = parsed.data;
  log('🟢', 'BODY PARSED', `slug=${slug} model=${modelId} sysLen=${systemPrompt.length} userLen=${userPrompt.length}`);

  if (systemPrompt.length + userPrompt.length > MAX_INPUT) {
    log('🔴', 'INPUT TOO LARGE', `${systemPrompt.length + userPrompt.length} chars`);
    res.status(413).json({ error: 'Input too large' });
    return;
  }

  const ip = clientIp(req as any);
  const rl = rateLimit(`gen:${ip}`);
  if (!rl.ok) {
    log('🟡', 'RATE LIMITED', `ip=${ip}`);
    res.setHeader('Retry-After', Math.ceil((rl.resetAt - Date.now()) / 1000).toString());
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const app = getApp(slug);
  if (!app) {
    log('🔴', 'APP NOT FOUND', slug);
    res.status(404).json({ error: 'App not found' });
    return;
  }

  if (app.password) {
    if (!password || password !== app.password) {
      log('🔴', 'AUTH FAILED', slug);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    log('🟢', 'AUTH OK');
  }

  const available = availableModelIds();
  log('🔵', 'AVAILABLE MODELS', available.join(', '));

  const allowed = effectiveAllowedModels(app, available);
  log('🔵', 'ALLOWED MODELS', allowed.map(m => m.id).join(', '));

  if (!allowed.find((m) => m.id === modelId)) {
    log('🔴', 'MODEL NOT ALLOWED', modelId);
    res.status(400).json({ error: 'Model not allowed' });
    return;
  }
  const model = getModel(modelId)!;
  log('🟢', 'MODEL RESOLVED', `provider=${model.provider} apiModel=${model.apiModel}`);

  let llm;
  try {
    if (model.provider === 'anthropic') {
      llm = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })(model.apiModel);
    } else if (model.provider === 'openai') {
      llm = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })(model.apiModel);
    } else {
      llm = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY! })(
        model.apiModel,
      );
    }
    log('🟢', 'LLM INITIALIZED');
  } catch (e: any) {
    log('🔴', 'LLM INIT FAILED', e.message);
    res.status(500).json({ error: 'Failed to initialize provider', message: e.message });
    return;
  }

  // SSE streaming
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  log('🔵', 'SSE HEADERS SENT');

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    log('🔵', 'CALLING streamText...');
    const result = await streamText({
      model: llm,
      system: systemPrompt,
      prompt: userPrompt,
    });
    log('🟢', 'streamText RESOLVED, reading textStream...');

    let chunkCount = 0;
    for await (const delta of result.textStream) {
      chunkCount++;
      send('delta', { text: delta });
    }
    log('🟢', 'STREAM COMPLETE', `${chunkCount} chunks sent`);
    send('done', {});
    res.end();
    log('🏁', 'RESPONSE ENDED');
  } catch (e: any) {
    log('🔴', 'STREAM ERROR', `${e.name}: ${e.message}`);
    send('error', { message: e?.message || 'Generation failed' });
    res.end();
  }
}
