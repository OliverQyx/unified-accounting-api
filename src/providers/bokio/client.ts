import type { ProviderClient } from '../types.js';
import { RateLimiter } from '../rate-limiter.js';
import { withRetry, ProviderError, type RetryConfig } from '../../utils/retry.js';

const BASE_URL = 'https://api.bokio.se/v1';

const RATE_LIMIT = { maxRequests: 5, windowMs: 1000 };

const RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const rateLimiter = new RateLimiter(RATE_LIMIT);

async function bokioFetch(
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
      `Bokio API error ${response.status}: ${body}`,
      response.status,
      'bokio',
      response.status === 429
        ? Number(response.headers.get('Retry-After') ?? 1) * 1000
        : undefined,
    );
  }

  return response;
}

function companyPath(companyId: string, relativePath: string): string {
  return `/companies/${companyId}${relativePath}`;
}

/**
 * Fetch a paginated endpoint.
 */
async function getPage(
  token: string,
  companyId: string,
  path: string,
  opts: { page?: number; pageSize?: number; query?: Record<string, string> },
): Promise<{ data: any[]; totalCount: number; totalPages: number; currentPage: number }> {
  const { page = 1, pageSize = 100, query = {} } = opts;

  const mergedQuery: Record<string, string> = {
    ...query,
    page: String(page),
    pageSize: String(pageSize),
  };

  const response = await withRetry(
    () => bokioFetch(token, companyPath(companyId, path), mergedQuery),
    RETRY_CONFIG,
  );

  const json: any = await response.json();

  // Bokio returns raw arrays for non-paginated endpoints (e.g. chart-of-accounts)
  if (Array.isArray(json)) {
    return { data: json, totalCount: json.length, totalPages: 1, currentPage: 1 };
  }

  // Bokio paginated response: { items: [...], totalItems, totalPages, currentPage }
  const data = Array.isArray(json.items) ? json.items : [];
  const totalPages = json.totalPages ?? 1;
  const totalCount = json.totalItems ?? data.length;
  const currentPage = json.currentPage ?? page;

  return { data, totalCount, totalPages, currentPage };
}

/**
 * Fetch a non-paginated endpoint (e.g. chart of accounts).
 * Returns all items from a raw array or { items: [...] } response.
 */
async function getAll(
  token: string,
  companyId: string,
  path: string,
): Promise<any[]> {
  const response = await withRetry(
    () => bokioFetch(token, companyPath(companyId, path)),
    RETRY_CONFIG,
  );

  const json: any = await response.json();

  if (Array.isArray(json)) return json;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.data)) return json.data;
  return [json];
}

/**
 * Fetch a single resource detail.
 */
async function getDetail(
  token: string,
  companyId: string,
  path: string,
): Promise<any> {
  const response = await withRetry(
    () => bokioFetch(token, companyPath(companyId, path)),
    RETRY_CONFIG,
  );

  return response.json();
}

/**
 * Fetch company metadata. Returns null on 404.
 */
async function getCompany(
  token: string,
  companyId: string,
): Promise<any | null> {
  try {
    const response = await withRetry(
      () => bokioFetch(token, `/companies/${companyId}`),
      RETRY_CONFIG,
    );
    return response.json();
  } catch (error) {
    if (error instanceof ProviderError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

export { getPage, getAll, getDetail, getCompany };

/**
 * ProviderClient implementation for Bokio.
 *
 * Because every Bokio Company API endpoint requires a companyId in the path,
 * callers must pass `params.companyId`.
 */
export const bokioClient: ProviderClient = {
  async getPage(token, endpoint, params) {
    const { page = 1, pageSize = 100, query = {}, companyId } = params;

    if (!companyId) {
      throw new ProviderError(
        'Bokio requires companyId for all Company API requests',
        400,
        'bokio',
      );
    }

    // For non-paginated endpoints (chart-of-accounts) or the company singleton,
    // the generic service layer still calls getPage — we handle that by detecting
    // the endpoint and falling back to getAll when needed.

    return getPage(token, companyId, endpoint, { page, pageSize, query });
  },

  async getDetail(token, endpoint, params) {
    const companyId = params?.companyId;

    if (!companyId) {
      throw new ProviderError(
        'Bokio requires companyId for all Company API requests',
        400,
        'bokio',
      );
    }

    return getDetail(token, companyId, endpoint);
  },
};
