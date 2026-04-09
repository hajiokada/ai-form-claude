import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getApp } from '@/lib/config';
import { clientIp, rateLimit } from '@/lib/rateLimit';

const BodySchema = z.object({
  slug: z.string(),
  password: z.string(),
});

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  // Stricter limit on password attempts
  const rl = rateLimit(`pw:${clientIp(req as any)}`, 10);
  if (!rl.ok) {
    res.status(429).json({ error: 'Too many attempts' });
    return;
  }

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const { slug, password } = parsed.data;
  const app = getApp(slug);
  if (!app) {
    res.status(404).json({ error: 'App not found' });
    return;
  }
  if (!app.password) {
    res.status(200).json({ ok: true });
    return;
  }
  if (password !== app.password) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  res.status(200).json({ ok: true });
}
