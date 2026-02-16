import type { ProviderClient } from '../types.js';
import { RateLimiter } from '../rate-limiter.js';
import { withRetry, ProviderError, type RetryConfig } from '../../utils/retry.js';

const BASE_URL = 'https://api-se.briox.services/v2';

const RATE_LIMIT = { maxRequests: 10, windowMs: 1000 };

const RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const rateLimiter = new RateLimiter(RATE_LIMIT);

async function brioxFetch(
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
      Authorization: token,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(
      `Briox API error ${response.status}: ${body}`,
      response.status,
      'briox',
      response.status === 429
        ? Number(response.headers.get('Retry-After') ?? 1) * 1000
        : undefined,
    );
  }

  return response;
}

/**
 * Fetch the current (active) financial year from Briox.
 * Returns the financial year ID (e.g. "10") by finding the year whose
 * date range contains today's date. Falls back to the last year in the list.
 */
export async function getCurrentFinancialYear(accessToken: string): Promise<string> {
  const response = await withRetry(
    () => brioxFetch(accessToken, '/financialyear'),
    RETRY_CONFIG,
  );

  const json: any = await response.json();
  const years: Array<{ id: string; fromdate?: string; todate?: string }> =
    json?.data?.financialyears ?? [];

  if (years.length === 0) {
    throw new ProviderError(
      'No financial years found in Briox account',
      404,
      'briox',
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  // Find the year that contains today
  const active = years.find((y) => {
    if (!y.fromdate || !y.todate) return false;
    return y.fromdate <= today && today <= y.todate;
  });

  return active?.id ?? years[years.length - 1].id;
}

export const brioxClient: ProviderClient = {
  async getPage(token, endpoint, params) {
    const { page = 1, pageSize = 100, query = {} } = params;

    const mergedQuery: Record<string, string> = {
      ...query,
      page: String(page),
      limit: String(pageSize),
    };

    const response = await withRetry(
      () => brioxFetch(token, endpoint, mergedQuery),
      RETRY_CONFIG,
    );

    const json: any = await response.json();

    // Briox wraps everything in { data: { <listKey>: [...], metainformation: {...} } }
    // For singleton endpoints (e.g. /user/info), the data may not contain a list.
    const dataPayload = json?.data ?? json;

    // Find the array in the data payload (skip metainformation)
    let items: any[] = [];
    let meta: any = dataPayload?.metainformation;

    for (const [key, value] of Object.entries(dataPayload)) {
      if (key === 'metainformation') continue;
      if (Array.isArray(value)) {
        items = value;
        break;
      }
    }

    // If no array found, treat the whole data payload as a singleton
    if (items.length === 0 && !meta) {
      items = [dataPayload];
    }

    const totalPages = meta?.total_pages ?? 1;
    const totalCount = meta?.total_count ?? items.length;

    return {
      data: items,
      totalCount,
      totalPages,
      currentPage: page,
    };
  },

  async getDetail(token, endpoint, params) {
    const response = await withRetry(
      () => brioxFetch(token, endpoint),
      RETRY_CONFIG,
    );

    const json: any = await response.json();
    const dataPayload = json?.data ?? json;

    // If a detailKey is provided, extract that sub-object
    if (params?.detailKey && dataPayload[params.detailKey]) {
      return dataPayload[params.detailKey];
    }

    return dataPayload;
  },
};
