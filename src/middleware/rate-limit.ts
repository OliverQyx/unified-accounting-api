import type { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface WindowEntry {
  timestamps: number[];
}

const clients = new Map<string, WindowEntry>();

// Periodically clean up stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of clients) {
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - 120_000) {
      clients.delete(key);
    }
  }
}, 5 * 60_000).unref();

/**
 * Sliding-window rate limit middleware.
 * Returns 429 immediately when limit is exceeded (does not queue/wait).
 */
export function rateLimitMiddleware(opts: RateLimitOptions) {
  const { maxRequests, windowMs } = opts;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = clients.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      clients.set(key, entry);
    }

    // Remove timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= maxRequests) {
      const retryAfter = Math.ceil((entry.timestamps[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: retryAfter,
        statusCode: 429,
      });
      return;
    }

    entry.timestamps.push(now);
    next();
  };
}
