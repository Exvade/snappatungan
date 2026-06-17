// src/lib/rateLimit.ts

const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const LIMIT = 10; // max 10 requests
const WINDOW_MS = 60 * 1000; // per 1 minute

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return true;
  }

  if (now - record.lastReset > WINDOW_MS) {
    // window expired, reset
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return true;
  }

  if (record.count >= LIMIT) {
    return false; // rate limited
  }

  record.count += 1;
  return true;
}
