// Lightweight in-memory rate limiter; replace with Upstash/KV for multi-instance.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = Number(process.env.RATE_LIMIT_PER_MIN || 60)): {
  ok: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const win = 60_000;
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    const fresh = { count: 1, resetAt: now + win };
    buckets.set(key, fresh);
    return { ok: true, remaining: limit - 1, resetAt: fresh.resetAt };
  }
  b.count += 1;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

export function clientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const xf = req.headers['x-forwarded-for'];
  const v = Array.isArray(xf) ? xf[0] : xf;
  if (v) return v.split(',')[0]!.trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string') return real;
  return 'unknown';
}
