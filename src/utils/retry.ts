export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  getDelayMs?: (error: unknown, attempt: number) => number | undefined;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatusCode(status: number): boolean {
  return status === 429 || status >= 500;
}

function isNonRetryableStatusCode(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public provider: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export async function withRetry<T>(fn: () => Promise<T>, config: RetryConfig): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error instanceof ProviderError && isNonRetryableStatusCode(error.statusCode)) {
        throw error;
      }

      if (config.shouldRetry && !config.shouldRetry(error, attempt)) {
        throw error;
      }

      if (attempt === config.maxAttempts) {
        throw error;
      }

      // Default: only retry on retryable status codes
      if (error instanceof ProviderError && !isRetryableStatusCode(error.statusCode)) {
        throw error;
      }

      let delayMs: number;
      const customDelay = config.getDelayMs?.(error, attempt);
      if (customDelay !== undefined) {
        delayMs = customDelay;
      } else {
        delayMs = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}
