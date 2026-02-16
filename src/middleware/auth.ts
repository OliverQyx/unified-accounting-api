import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

// Hash all valid API keys at startup for timing-safe comparison
const hashedKeys = new Set(
  env.apiKeys.map((key) => createHash('sha256').update(key).digest('hex'))
);

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Invalid or missing API key',
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
    return;
  }

  const apiKey = authHeader.slice(7);
  if (!hashedKeys.has(hashKey(apiKey))) {
    res.status(401).json({
      error: 'Invalid or missing API key',
      code: 'UNAUTHORIZED',
      statusCode: 401,
    });
    return;
  }

  next();
}

export function providerTokenMiddleware(req: Request, res: Response, next: NextFunction): void {
  const providerToken = req.headers['x-provider-token'] as string | undefined;
  if (!providerToken) {
    res.status(401).json({
      error: 'Missing X-Provider-Token header',
      code: 'MISSING_PROVIDER_TOKEN',
      statusCode: 401,
    });
    return;
  }

  next();
}
