import type { ProviderOAuthHelpers, TokenResponse } from '../types.js';
import { getVismaEnv } from '../../config/env.js';

const AUTH_URL = 'https://identity.vismaonline.com/connect/authorize';
const TOKEN_URL = 'https://identity.vismaonline.com/connect/token';
const REVOKE_URL = 'https://identity.vismaonline.com/connect/revocation';

const ACR_VALUES = 'service:44643EB1-3F76-4C1C-A672-402AE8085934';
const DEFAULT_SCOPES = 'ea:api offline_access ea:sales_readonly ea:accounting_readonly ea:purchase_readonly';

function basicAuthHeader(): string {
  const { VISMA_CLIENT_ID, VISMA_CLIENT_SECRET } = getVismaEnv();
  const credentials = Buffer.from(`${VISMA_CLIENT_ID}:${VISMA_CLIENT_SECRET}`).toString('base64');
  return `Basic ${credentials}`;
}

function buildAuthUrl(params: { scopes?: string; state?: string }): string {
  const { VISMA_CLIENT_ID, VISMA_REDIRECT_URI } = getVismaEnv();
  const scopes = params.scopes ?? DEFAULT_SCOPES;

  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', VISMA_CLIENT_ID);
  url.searchParams.set('redirect_uri', VISMA_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('acr_values', ACR_VALUES);
  if (params.state) {
    url.searchParams.set('state', params.state);
  }

  return url.toString();
}

async function exchangeCode(code: string): Promise<TokenResponse> {
  const { VISMA_REDIRECT_URI } = getVismaEnv();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: VISMA_REDIRECT_URI,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Visma token exchange failed (${response.status}): ${text}`);
  }

  const json: any = await response.json();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    token_type: json.token_type ?? 'Bearer',
    expires_in: json.expires_in,
  };
}

async function refreshToken(refreshTokenValue: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Visma token refresh failed (${response.status}): ${text}`);
  }

  const json: any = await response.json();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    token_type: json.token_type ?? 'Bearer',
    expires_in: json.expires_in,
  };
}

async function revokeToken(token: string): Promise<void> {
  const body = new URLSearchParams({
    token,
    token_type_hint: 'refresh_token',
  });

  const response = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Visma token revocation failed (${response.status}): ${text}`);
  }
}

export const vismaOAuth: ProviderOAuthHelpers = {
  buildAuthUrl,
  exchangeCode,
  refreshToken,
  revokeToken,
};
