import type { ProviderOAuthHelpers, TokenResponse } from '../types.js';
import { getBjornLundenEnv } from '../../config/env.js';

const TOKEN_URL = 'https://apigateway.blinfo.se/auth/oauth/v2/token';

/**
 * Request a new access token using the Client Credentials grant.
 *
 * Bjorn Lunden does not use an authorization-code flow -- instead, the
 * integration authenticates with client_id + client_secret directly.
 * Each token is valid for 3600 seconds (1 hour).
 */
async function requestClientCredentialsToken(): Promise<TokenResponse> {
  const { BJORN_LUNDEN_CLIENT_ID, BJORN_LUNDEN_CLIENT_SECRET } = getBjornLundenEnv();

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: BJORN_LUNDEN_CLIENT_ID,
    client_secret: BJORN_LUNDEN_CLIENT_SECRET,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Bjorn Lunden token request failed (${response.status}): ${text}`,
    );
  }

  const json = await response.json() as any;

  return {
    access_token: json.access_token,
    token_type: json.token_type ?? 'bearer',
    expires_in: json.expires_in ?? 3600,
    // Client credentials flow does not issue a refresh token
    refresh_token: undefined,
  };
}

export const bjornLundenOAuth: ProviderOAuthHelpers = {
  buildAuthUrl() {
    throw new Error(
      'Bjorn Lunden uses the OAuth 2.0 Client Credentials flow. ' +
        'There is no user-facing authorization URL. ' +
        'Use exchangeCode (or refreshToken) to obtain an access token directly.',
    );
  },

  async exchangeCode(_code: string): Promise<TokenResponse> {
    throw new Error(
      'Bjorn Lunden uses the Client Credentials flow, not the Authorization Code flow. ' +
        'Call refreshToken() to obtain a new access token.',
    );
  },

  async refreshToken(_refreshToken: string): Promise<TokenResponse> {
    // For Client Credentials, "refreshing" simply means requesting a new token.
    return requestClientCredentialsToken();
  },
};
