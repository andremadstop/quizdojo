const buckets = new Map();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.start > 5 * 60 * 1000) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

export function roleRateLimit({ adminMax = 120, userMax = 60, windowMs = 60_000 } = {}) {
  return (req, res, next) => {
    const key = `${req.user?.sub || 'anon'}:${req.ip || 'unknown'}`;
    const now = Date.now();
    const entry = buckets.get(key) || { count: 0, start: now };
    if (now - entry.start > windowMs) {
      entry.count = 0;
      entry.start = now;
    }
    const max = req.user?.role === 'admin' ? adminMax : userMax;
    if (entry.count >= max) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    entry.count += 1;
    buckets.set(key, entry);
    next();
  };
}
