import type { Request, Response, NextFunction } from 'express';
import { ProviderError } from '../utils/retry.js';

export interface ApiError {
  error: string;
  code: string;
  provider?: string;
  statusCode: number;
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public provider?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function mapProviderStatusCode(providerStatus: number): { statusCode: number; code: string } {
  switch (providerStatus) {
    case 401:
      return { statusCode: 401, code: 'PROVIDER_AUTH_ERROR' };
    case 403:
      return { statusCode: 403, code: 'PROVIDER_FORBIDDEN' };
    case 404:
      return { statusCode: 404, code: 'PROVIDER_NOT_FOUND' };
    case 429:
      return { statusCode: 429, code: 'PROVIDER_RATE_LIMITED' };
    default:
      if (providerStatus >= 500) {
        return { statusCode: 502, code: 'PROVIDER_ERROR' };
      }
      return { statusCode: 502, code: 'PROVIDER_ERROR' };
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      provider: err.provider,
      statusCode: err.statusCode,
    });
    return;
  }

  if (err instanceof ProviderError) {
    const { statusCode, code } = mapProviderStatusCode(err.statusCode);
    res.status(statusCode).json({
      error: err.message,
      code,
      provider: err.provider,
      statusCode,
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    statusCode: 500,
  });
}
