// ST3: tiny per-user cooldown map for abuse-sensitive routes (Stripe link
// minting). Best-effort per serverless instance — it stops casual double-click
// / script loops, not distributed abuse. Use Upstash/Vercel KV if a hard
// global limit is ever needed.
const COOLDOWN_MS = 60_000;
const lastHit = new Map<string, number>();

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
