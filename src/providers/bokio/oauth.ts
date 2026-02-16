import type { ProviderOAuthHelpers } from '../types.js';

/**
 * Bokio uses static API tokens (Integration Tokens) for private integrations.
 *
 * There is no OAuth authorization-code flow, no token refresh, and no
 * revocation endpoint.  Tokens are generated manually in the Bokio app
 * under Settings > API Tokens and do not expire.
 *
 * Public integrations use OAuth 2.0 but that flow is managed externally
 * through Bokio's developer portal and is not handled here.
 */
export const bokioOAuth: ProviderOAuthHelpers = {
  exchangeCode: async (_code: string) => {
    throw new Error(
      'Bokio uses static API tokens (Integration Tokens) generated in the Bokio app. ' +
        'There is no authorization-code exchange flow.',
    );
  },

  refreshToken: async (_refreshToken: string) => {
    throw new Error(
      'Bokio Integration Tokens do not expire and cannot be refreshed. ' +
        'Generate a new token in the Bokio app if needed.',
    );
  },

  revokeToken: async (_token: string) => {
    throw new Error(
      'Bokio token revocation is not supported via API. ' +
        'Delete the Private Integration in the Bokio app to revoke access.',
    );
  },
};
