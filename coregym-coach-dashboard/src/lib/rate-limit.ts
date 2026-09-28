// ST3 (API-05): tiny per-user throttles for abuse-sensitive routes. Best-
// effort PER SERVERLESS INSTANCE — it stops casual double-clicks, script
// loops and single-connection floods, not distributed abuse. Use
// Upstash/Vercel KV if a hard global limit is ever needed (documented
// limitation, deliberately not faked).
const COOLDOWN_MS = 60_000;
const lastHit = new Map<string, number>();
const hits = new Map<string, { windowStart: number; count: number }>();

/** Returns true when the caller must wait; records the hit otherwise. */
export function checkCooldown(key: string, cooldownMs: number = COOLDOWN_MS): boolean {
  const now = Date.now();
  const prev = lastHit.get(key);
  if (prev != null && now - prev < cooldownMs) return true;
  lastHit.set(key, now);
  // Bound memory: drop entries older than the window on each check.
  if (lastHit.size > 1000) {
    for (const [k, t] of lastHit) {
      if (now - t >= cooldownMs) lastHit.delete(k);
    }
  }
  return false;
}

/**
 * Fixed-window counter: true when `maxHits` within `windowMs` is exceeded
 * (the hit that breaches the limit is NOT counted as allowed). Used on
 * expensive/unbounded endpoints (export, uploads, enrollments). Same
 * per-instance caveat as checkCooldown.
 */
export function rateLimit(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    hits.set(key, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (now - v.windowStart >= windowMs) hits.delete(k);
    }
  }
  return entry.count > maxHits;
}
