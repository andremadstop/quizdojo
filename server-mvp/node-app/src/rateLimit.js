const attempts = new Map();

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now - entry.first > 30 * 60 * 1000) attempts.delete(key);
  }
}, 10 * 60 * 1000).unref();

export function loginRateLimit({ windowMs = 10 * 60 * 1000, max = 5 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = attempts.get(ip) || { count: 0, first: now };
    if (now - entry.first > windowMs) {
      entry.count = 0;
      entry.first = now;
    }
    if (entry.count >= max) {
      return res.status(429).json({ error: 'too_many_attempts' });
    }
    entry.count += 1;
    attempts.set(ip, entry);
    next();
  };
}
