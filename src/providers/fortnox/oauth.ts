import crypto from 'crypto';
import type { ProviderOAuthHelpers, TokenResponse } from '../types.js';
import { getFortnoxEnv } from '../../config/env.js';

const AUTH_URL = 'https://apps.fortnox.se/oauth-v1/auth';
const TOKEN_URL = 'https://apps.fortnox.se/oauth-v1/token';
const REVOKE_URL = 'https://apps.fortnox.se/oauth-v1/revoke';

const DEFAULT_SCOPES = 'companyinformation bookkeeping supplierinvoice';

function buildBasicAuth(): string {
  const { FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET } = getFortnoxEnv();
  const credentials = `${FORTNOX_CLIENT_ID}:${FORTNOX_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function postTokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: buildBasicAuth(),
    },
    body: body.toString(),
  });

  if (!response.ok) {
    let message: string;
    try {
      const errorBody: any = await response.json();
      message = errorBody?.error_description || errorBody?.error || response.statusText;
    } catch {
      message = response.statusText;
    }
    throw new Error(`Fortnox OAuth error (${response.status}): ${message}`);
  }

  const data: any = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
  };
}

export const fortnoxOAuth: ProviderOAuthHelpers = {
  buildAuthUrl(params: { scopes?: string; state?: string }): string {
    const { FORTNOX_CLIENT_ID, FORTNOX_REDIRECT_URI } = getFortnoxEnv();

    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', FORTNOX_CLIENT_ID);
    url.searchParams.set('redirect_uri', FORTNOX_REDIRECT_URI);
    url.searchParams.set('scope', params.scopes || DEFAULT_SCOPES);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');

    url.searchParams.set('state', params.state || crypto.randomUUID());

    return url.toString();
  },

  async exchangeCode(code: string): Promise<TokenResponse> {
    const { FORTNOX_REDIRECT_URI } = getFortnoxEnv();

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', FORTNOX_REDIRECT_URI);

    return postTokenRequest(body);
  },

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);

    return postTokenRequest(body);
  },

  async revokeToken(token: string): Promise<void> {
    const response = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: buildBasicAuth(),
      },
      body: new URLSearchParams({
        token_type_hint: 'refresh_token',
        token,
      }).toString(),
    });

    if (!response.ok) {
      let message: string;
      try {
        const errorBody: any = await response.json();
        message = errorBody?.error_description || errorBody?.error || response.statusText;
      } catch {
        message = response.statusText;
      }
      throw new Error(`Fortnox revoke error (${response.status}): ${message}`);
    }
  },
};
