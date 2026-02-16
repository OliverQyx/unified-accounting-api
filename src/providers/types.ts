import type { ResourceType } from '../types/dto.js';

export type ProviderName = 'fortnox' | 'visma' | 'briox' | 'bokio' | 'bjornlunden';

export interface ProviderResourceConfig {
  listEndpoint: string;
  detailEndpoint: string;
  listKey?: string;
  detailKey?: string;
  idField: string;
  mapper: (raw: any) => any;
  detailMapper?: (raw: any) => any;
  singleton?: boolean;
  paginated?: boolean;
  needsEntryHydration?: boolean;
  yearScoped?: boolean;
  modifiedFilterParam?: string;
}

export interface ProviderOAuthHelpers {
  buildAuthUrl?: (params: { scopes?: string; state?: string }) => string;
  exchangeCode: (code: string) => Promise<TokenResponse>;
  refreshToken: (refreshToken: string) => Promise<TokenResponse>;
  revokeToken?: (token: string) => Promise<void>;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}

export interface ProviderClient {
  getPage(
    token: string,
    endpoint: string,
    params: {
      page?: number;
      pageSize?: number;
      query?: Record<string, string>;
      companyId?: string;
      userKey?: string;
    }
  ): Promise<{ data: any[]; totalCount: number; totalPages: number; currentPage: number }>;

  getDetail(
    token: string,
    endpoint: string,
    params?: {
      detailKey?: string;
      companyId?: string;
      userKey?: string;
    }
  ): Promise<any>;
}

export interface ProviderRegistryEntry {
  client: ProviderClient;
  configs: Partial<Record<ResourceType, ProviderResourceConfig>>;
  oauth: ProviderOAuthHelpers;
  requiresCompanyId?: boolean;
}
