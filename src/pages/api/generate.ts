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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    assertStartupEnv();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
    return;
  }

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }
  const { slug, systemPrompt, userPrompt, modelId, password } = parsed.data;

  if (systemPrompt.length + userPrompt.length > MAX_INPUT) {
    res.status(413).json({ error: 'Input too large' });
    return;
  }

  const ip = clientIp(req as any);
  const rl = rateLimit(`gen:${ip}`);
  if (!rl.ok) {
    res.setHeader('Retry-After', Math.ceil((rl.resetAt - Date.now()) / 1000).toString());
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const app = getApp(slug);
  if (!app) {
    res.status(404).json({ error: 'App not found' });
    return;
  }

  if (app.password) {
    if (!password || password !== app.password) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const available = availableModelIds();
  const allowed = effectiveAllowedModels(app, available);
  if (!allowed.find((m) => m.id === modelId)) {
    res.status(400).json({ error: 'Model not allowed' });
    return;
  }
  const model = getModel(modelId)!;

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
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to initialize provider', message: e.message });
    return;
  }

  // SSE streaming
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await streamText({
      model: llm,
      system: systemPrompt,
      prompt: userPrompt,
    });

    for await (const delta of result.textStream) {
      send('delta', { text: delta });
    }
    send('done', {});
    res.end();
  } catch (e: any) {
    send('error', { message: e?.message || 'Generation failed' });
    res.end();
  }
}
