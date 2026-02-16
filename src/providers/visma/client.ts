import type { ProviderClient } from '../types.js';
import { RateLimiter } from '../rate-limiter.js';
import { withRetry, ProviderError, type RetryConfig } from '../../utils/retry.js';

const BASE_URL = 'https://eaccountingapi.vismaonline.com/v2';

const RATE_LIMIT = { maxRequests: 10, windowMs: 1000 };

const RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const rateLimiter = new RateLimiter(RATE_LIMIT);

async function vismaFetch(
  token: string,
  path: string,
  query?: Record<string, string>,
): Promise<Response> {
  await rateLimiter.acquire();

  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(
      `Visma API error ${response.status}: ${body}`,
      response.status,
      'visma',
      response.status === 429
        ? Number(response.headers.get('Retry-After') ?? 1) * 1000
        : undefined,
    );
  }

  return response;
}

export interface AccountBalanceEntry {
  AccountNumber: number;
  Balance: number;
}

/**
 * Best-effort fetch of account balances for today.
 * Returns a map of AccountNumber -> Balance, or an empty map on failure.
 */
export async function fetchAccountBalances(
  token: string,
): Promise<Map<number, number>> {
  const balanceMap = new Map<number, number>();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const response = await withRetry(
      () => vismaFetch(token, `/accountbalances/${today}`),
      RETRY_CONFIG,
    );
    const json: any = await response.json();
    const items: AccountBalanceEntry[] = json.Data ?? json ?? [];
    for (const entry of items) {
      if (entry.AccountNumber != null && entry.Balance != null) {
        balanceMap.set(entry.AccountNumber, entry.Balance);
      }
    }
  } catch {
    // Non-fatal: return empty map
  }
  return balanceMap;
}

export const vismaClient: ProviderClient = {
  async getPage(token, endpoint, params) {
    const { page = 1, pageSize = 100, query = {} } = params;

    const skip = (page - 1) * pageSize;
    const mergedQuery: Record<string, string> = {
      ...query,
      $skip: String(skip),
      $top: String(pageSize),
    };

    const response = await withRetry(
      () => vismaFetch(token, endpoint, mergedQuery),
      RETRY_CONFIG,
    );

    const json: any = await response.json();

    // Visma returns { Data: [...], Meta: { TotalNumberOfPages, TotalNumberOfResults } }
    // For singleton endpoints (e.g. /companysettings), the response is a plain object.
    const data = Array.isArray(json.Data)
      ? json.Data
      : json.Data != null
        ? [json.Data]
        : [json];

    const totalPages = json.Meta?.TotalNumberOfPages ?? 1;
    const totalCount = json.Meta?.TotalNumberOfResults ?? data.length;

    return {
      data,
      totalCount,
      totalPages,
      currentPage: page,
    };
  },

  async getDetail(token, endpoint) {
    const response = await withRetry(
      () => vismaFetch(token, endpoint),
      RETRY_CONFIG,
    );

    const json: any = await response.json();

    // Detail endpoints may return { Data: {...} } or a plain object
    return json.Data ?? json;
  },
};
