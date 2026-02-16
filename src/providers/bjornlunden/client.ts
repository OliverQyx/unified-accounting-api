import type { ProviderClient } from '../types.js';
import { RateLimiter } from '../rate-limiter.js';
import { withRetry, ProviderError, type RetryConfig } from '../../utils/retry.js';

const BASE_URL = 'https://apigateway.blinfo.se/bla-api/v1/sp';

const RATE_LIMIT = { maxRequests: 10, windowMs: 1000 };

const RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const rateLimiter = new RateLimiter(RATE_LIMIT);

async function blFetch(
  token: string,
  userKey: string,
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
      'User-Key': userKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(
      `Bjorn Lunden API error ${response.status}: ${body}`,
      response.status,
      'bjornlunden',
      response.status === 429
        ? Number(response.headers.get('Retry-After') ?? 1) * 1000
        : undefined,
    );
  }

  return response;
}

/**
 * Fetch a paginated batch endpoint.
 *
 * BL batch endpoints use either `pageRequested` + `rowsRequested` or `page` + `rows`
 * as pagination query parameters. The response envelope contains:
 *   { pageRequested, totalPages, totalRows, data: [...] }
 */
async function getPage(
  token: string,
  userKey: string,
  path: string,
  options: { page?: number; pageSize?: number; query?: Record<string, string> },
): Promise<{ data: any[]; totalCount: number; totalPages: number; currentPage: number }> {
  const { page = 1, pageSize = 100, query = {} } = options;

  // BL endpoints accept different param names depending on the resource.
  // supplierinvoice/batch uses `page` + `rows`; most others use `rows` only (page is implicit).
  // We send both variants so the API picks up whichever it expects.
  const mergedQuery: Record<string, string> = {
    ...query,
    page: String(page),
    rows: String(pageSize),
    pageRequested: String(page),
    rowsRequested: String(pageSize),
  };

  const response = await withRetry(
    () => blFetch(token, userKey, path, mergedQuery),
    RETRY_CONFIG,
  );

  const json = await response.json() as any;

  // Batch response: { pageRequested, totalPages, totalRows, data: [...] }
  const data: any[] = Array.isArray(json.data)
    ? json.data
    : Array.isArray(json)
      ? json
      : [];

  const totalPages = json.totalPages ?? 1;
  const totalCount = json.totalRows ?? data.length;
  const currentPage = json.pageRequested ?? page;

  return { data, totalCount, totalPages, currentPage };
}

/**
 * Fetch a non-paginated list endpoint (e.g. /customer, /supplier, /account).
 * Returns the full array of records.
 */
async function getAll(
  token: string,
  userKey: string,
  path: string,
): Promise<any[]> {
  const response = await withRetry(
    () => blFetch(token, userKey, path),
    RETRY_CONFIG,
  );

  const json = await response.json() as any;

  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  return [json];
}

/**
 * Fetch a single resource / detail endpoint.
 */
async function getDetail(
  token: string,
  userKey: string,
  path: string,
): Promise<any> {
  const response = await withRetry(
    () => blFetch(token, userKey, path),
    RETRY_CONFIG,
  );

  const json = await response.json() as any;
  return json.data ?? json;
}

export const bjornLundenClient: ProviderClient = {
  async getPage(token, endpoint, params) {
    const { page, pageSize, query, userKey } = params;

    if (!userKey) {
      throw new ProviderError(
        'Bjorn Lunden requires a userKey (company GUID) for every request',
        400,
        'bjornlunden',
      );
    }

    return getPage(token, userKey, endpoint, { page, pageSize, query });
  },

  async getDetail(token, endpoint, params) {
    const userKey = params?.userKey;

    if (!userKey) {
      throw new ProviderError(
        'Bjorn Lunden requires a userKey (company GUID) for every request',
        400,
        'bjornlunden',
      );
    }

    return getDetail(token, userKey, endpoint);
  },
};

export { getAll, getDetail as getDetailDirect, getPage as getPageDirect };
