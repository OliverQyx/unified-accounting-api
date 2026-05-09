import type { ProviderClient } from '../types.js';
import { RateLimiter } from '../rate-limiter.js';
import { ProviderError, withRetry, type RetryConfig } from '../../utils/retry.js';

const BASE_URL = 'https://api.fortnox.se/3';
const ATTACHMENTS_BASE_URL = 'https://api.fortnox.se/api/fileattachments/attachments-v1';
const PROVIDER_NAME = 'fortnox';

const RATE_LIMIT_CONFIG = {
  maxRequests: 4,
  windowMs: 1000,
};

const RETRY_CONFIG: RetryConfig = {
  maxAttempts: 6,
  initialDelayMs: 2000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  getDelayMs(error: unknown): number | undefined {
    if (error instanceof ProviderError && error.statusCode === 429 && error.retryAfter) {
      return error.retryAfter * 1000;
    }
    return undefined;
  },
};

const rateLimiter = new RateLimiter(RATE_LIMIT_CONFIG);

async function request(
  token: string,
  endpoint: string,
  query?: Record<string, string>,
): Promise<any> {
  await rateLimiter.acquire();

  const url = new URL(`${BASE_URL}${endpoint}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }

  return withRetry(async () => {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

      let message: string;
      try {
        const errorBody: any = await response.json();
        message = errorBody?.ErrorInformation?.Message
          || errorBody?.message
          || response.statusText;
      } catch {
        message = response.statusText;
      }

      throw new ProviderError(
        `Fortnox API error (${response.status}): ${message}`,
        response.status,
        PROVIDER_NAME,
        Number.isNaN(retryAfter as number) ? undefined : retryAfter,
      );
    }

    return response.json();
  }, RETRY_CONFIG);
}

export interface FortnoxAttachment {
  fileId: string;
  name: string;
  mimeType: string;
}

export async function getFortnoxAttachments(
  token: string,
  entityId: string,
  entityType: string,
): Promise<FortnoxAttachment[]> {
  await rateLimiter.acquire();

  const url = new URL(ATTACHMENTS_BASE_URL + '/');
  url.searchParams.set('entityid', entityId);
  url.searchParams.set('entitytype', entityType);

  return withRetry(async () => {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      let message: string;
      try {
        const errorBody: any = await response.json();
        message = errorBody?.message || response.statusText;
      } catch {
        message = response.statusText;
      }
      throw new ProviderError(
        `Fortnox attachments API error (${response.status}): ${message}`,
        response.status,
        PROVIDER_NAME,
        Number.isNaN(retryAfter as number) ? undefined : retryAfter,
      );
    }

    const body: any = await response.json();
    return (body ?? []) as FortnoxAttachment[];
  }, RETRY_CONFIG);
}

export async function downloadFortnoxFile(
  token: string,
  fileId: string,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  await rateLimiter.acquire();

  const url = new URL(`${BASE_URL}/archive`);
  url.searchParams.set('fileid', fileId);

  return withRetry(async () => {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      let message: string;
      try {
        const errorBody: any = await response.json();
        message = errorBody?.ErrorInformation?.Message || errorBody?.message || response.statusText;
      } catch {
        message = response.statusText;
      }
      throw new ProviderError(
        `Fortnox archive API error (${response.status}): ${message}`,
        response.status,
        PROVIDER_NAME,
        Number.isNaN(retryAfter as number) ? undefined : retryAfter,
      );
    }

    const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream';
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filenameMatch = disposition.match(/filename="?([^";\r\n]+)"?/i);
    const filename = filenameMatch ? filenameMatch[1] : `file-${fileId}.pdf`;
    const buffer = await response.arrayBuffer();

    return { buffer, contentType, filename };
  }, RETRY_CONFIG);
}

export const fortnoxClient: ProviderClient = {
  async getPage(
    token: string,
    endpoint: string,
    params: {
      page?: number;
      pageSize?: number;
      query?: Record<string, string>;
      companyId?: string;
      userKey?: string;
    },
  ): Promise<{ data: any[]; totalCount: number; totalPages: number; currentPage: number }> {
    const queryParams: Record<string, string> = { ...params.query };

    if (params.page !== undefined) {
      queryParams.page = String(params.page);
    }
    if (params.pageSize !== undefined) {
      queryParams.limit = String(params.pageSize);
    }

    const body = await request(token, endpoint, queryParams);

    // Fortnox wraps list data with a key that matches the resource type.
    // MetaInformation contains pagination details.
    const meta = body?.MetaInformation;
    const totalPages = meta?.['@TotalPages'] ?? 1;
    const currentPage = meta?.['@CurrentPage'] ?? 1;
    const totalCount = meta?.['@TotalResources'] ?? 0;

    // Find the list data — it is the first array-valued property that is not MetaInformation.
    let data: any[] = [];
    for (const key of Object.keys(body)) {
      if (key === 'MetaInformation') continue;
      if (Array.isArray(body[key])) {
        data = body[key];
        break;
      }
      // Singleton resources (e.g. CompanyInformation) are objects, not arrays.
      if (body[key] && typeof body[key] === 'object' && !Array.isArray(body[key])) {
        data = [body[key]];
        break;
      }
    }

    return { data, totalCount, totalPages, currentPage };
  },

  async getDetail(
    token: string,
    endpoint: string,
    params?: {
      detailKey?: string;
      companyId?: string;
      userKey?: string;
    },
  ): Promise<any> {
    const body = await request(token, endpoint);

    // If a detailKey is provided, unwrap the response object.
    if (params?.detailKey && body?.[params.detailKey]) {
      return body[params.detailKey];
    }

    // Fallback: try to find the first non-meta object property.
    for (const key of Object.keys(body)) {
      if (key === 'MetaInformation') continue;
      if (body[key] && typeof body[key] === 'object') {
        return body[key];
      }
    }

    return body;
  },
};
