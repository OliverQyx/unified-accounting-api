import type { ProviderOAuthHelpers, TokenResponse } from '../types.js';
import { ProviderError } from '../../utils/retry.js';
import { getBrioxEnv } from '../../config/env.js';

const TOKEN_URL = 'https://api-se.briox.services/v2/token';
const REFRESH_URL = 'https://api-se.briox.services/v2/tokenrefresh';

/**
 * Exchange an application token (code) for an access token.
 *
 * Briox uses a non-standard OAuth flow:
 * POST /token?clientid=<clientId>&token=<applicationToken>
 *
 * Response: { data: { access_token, refresh_token, expire_timestamp, expire_date } }
 */
async function exchangeCode(code: string): Promise<TokenResponse> {
  const { BRIOX_CLIENT_ID } = getBrioxEnv();

  const url = new URL(TOKEN_URL);
  url.searchParams.set('clientid', BRIOX_CLIENT_ID);
  url.searchParams.set('token', code);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(
      `Briox token exchange failed ${response.status}: ${body}`,
      response.status,
      'briox',
    );
  }

  const json: any = await response.json();
  const data = json.data ?? json;

  const expireTimestamp = Number(data.expire_timestamp);
  const expiresIn = expireTimestamp
    ? expireTimestamp - Math.floor(Date.now() / 1000)
    : undefined;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: 'bearer',
    expires_in: expiresIn,
  };
}

/**
 * Refresh the access token.
 *
 * Briox refresh uses a non-standard flow:
 * POST /tokenrefresh?refreshtoken=<refreshToken>&token=<currentAccessToken>
 *
 * The `refreshTokenValue` parameter is expected to contain both tokens
 * separated by a pipe character: "refreshToken|accessToken".
 * If only a refresh token is provided, it will be used for both parameters.
 */
async function refreshToken(refreshTokenValue: string): Promise<TokenResponse> {
  // Support passing "refreshToken|accessToken" or just "refreshToken"
  const [refreshPart, accessPart] = refreshTokenValue.includes('|')
    ? refreshTokenValue.split('|', 2)
    : [refreshTokenValue, refreshTokenValue];

  const url = new URL(REFRESH_URL);
  url.searchParams.set('refreshtoken', refreshPart);
  url.searchParams.set('token', accessPart);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProviderError(
      `Briox token refresh failed ${response.status}: ${body}`,
      response.status,
      'briox',
    );
  }

  const json: any = await response.json();
  const data = json.data ?? json;

  const expireTimestamp = Number(data.expire_timestamp);
  const expiresIn = expireTimestamp
    ? expireTimestamp - Math.floor(Date.now() / 1000)
    : undefined;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: 'bearer',
    expires_in: expiresIn,
  };
}

export const brioxOAuth: ProviderOAuthHelpers = {
  buildAuthUrl: (_params: { scopes?: string; state?: string }): string => {
    throw new ProviderError(
      'Briox does not use standard OAuth authorization URLs. ' +
        'Instead, generate an Application Token from the Briox admin panel ' +
        '(Admin > Users > Application Token) and exchange it via the token endpoint.',
      400,
      'briox',
    );
  },
  exchangeCode,
  refreshToken,
  // Briox does not support token revocation
};
