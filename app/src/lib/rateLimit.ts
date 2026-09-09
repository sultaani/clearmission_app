/**
 * In-memory sliding-window rate limiter. Deliberately simple: fine for a
 * single-instance deployment, but does NOT share state across multiple
 * server instances (would need Redis or similar for that) — noted as a
 * limitation, not hidden.
 */
const attempts = new Map<string, { count: number; windowStart: number }>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

// Prevent unbounded memory growth from a flood of distinct fake IPs —
// periodically drop entries whose window has already expired.
function sweep() {
  const now = Date.now();
  for (const [key, entry] of attempts.entries()) {
    if (now - entry.windowStart > WINDOW_MS) attempts.delete(key);
  }
}

export function isRateLimited(key: string): boolean {
  sweep();
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > WINDOW_MS) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

export function getClientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0].trim() ?? 'unknown';
}
