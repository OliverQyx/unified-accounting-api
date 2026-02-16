import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getProvider, isValidProvider } from '../providers/registry.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { triggerBackgroundSync } from '../utils/sync.js';
import type { ProviderName } from '../providers/types.js';

const router = Router();

// ─── Browser-facing routes (no API key auth) ─────────────────────────

/**
 * GET /oauth/:provider/connect
 *
 * Dashboard redirects the user here. We build the provider's auth URL
 * and redirect the browser to the provider's login page.
 *
 * Query params:
 *   - redirect_uri (required) — where to send the user after OAuth completes
 *   - webhook_url (optional) — where to POST all fetched data after connect
 *   - state (optional) — CSRF token from the dashboard
 *   - scopes (optional) — override default scopes
 */
router.get('/:provider/connect', (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerName = req.params.provider as string;

    if (!isValidProvider(providerName)) {
      throw new AppError(`Unknown provider: ${providerName}`, 400, 'INVALID_PROVIDER');
    }

    const entry = getProvider(providerName)!;

    if (!entry.oauth.buildAuthUrl) {
      throw new AppError(
        `Provider '${providerName}' does not support OAuth connect flow. ` +
          getAuthExplanation(providerName),
        400,
        'UNSUPPORTED_RESOURCE',
        providerName
      );
    }

    const redirectUri = req.query.redirect_uri as string | undefined;
    if (!redirectUri) {
      throw new AppError('Missing required query parameter: redirect_uri', 400, 'VALIDATION_ERROR');
    }

    const webhookUrl = req.query.webhook_url as string | undefined;
    const scopes = req.query.scopes as string | undefined;
    const dashboardState = req.query.state as string | undefined;

    // Encode dashboard redirect_uri + webhook_url + state into the OAuth state param (stateless)
    const oauthState = Buffer.from(
      JSON.stringify({
        redirect_uri: redirectUri,
        webhook_url: webhookUrl || '',
        state: dashboardState || '',
      })
    ).toString('base64url');

    const url = entry.oauth.buildAuthUrl({ scopes, state: oauthState });
    res.redirect(url);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /oauth/:provider/callback
 *
 * The provider redirects the user here after they approve access.
 * We exchange the code for tokens and POST them to the dashboard
 * via an auto-submitting HTML form (tokens stay out of the URL).
 */
router.get('/:provider/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerName = req.params.provider as string;

    if (!isValidProvider(providerName)) {
      throw new AppError(`Unknown provider: ${providerName}`, 400, 'INVALID_PROVIDER');
    }

    // Check for OAuth error response from provider
    if (req.query.error) {
      const errorDesc = req.query.error_description || req.query.error;
      throw new AppError(
        `OAuth error from ${providerName}: ${errorDesc}`,
        400,
        'PROVIDER_AUTH_ERROR',
        providerName
      );
    }

    const code = req.query.code as string | undefined;
    if (!code) {
      throw new AppError('Missing authorization code from provider', 400, 'VALIDATION_ERROR');
    }

    const oauthState = req.query.state as string | undefined;
    if (!oauthState) {
      throw new AppError('Missing state parameter', 400, 'VALIDATION_ERROR');
    }

    // Decode the dashboard redirect_uri + webhook_url + state from the OAuth state param
    let redirectUri: string;
    let webhookUrl: string;
    let dashboardState: string;
    try {
      const decoded = JSON.parse(Buffer.from(oauthState, 'base64url').toString('utf-8'));
      redirectUri = decoded.redirect_uri;
      webhookUrl = decoded.webhook_url || '';
      dashboardState = decoded.state || '';
    } catch {
      throw new AppError('Invalid state parameter', 400, 'VALIDATION_ERROR');
    }

    if (!redirectUri) {
      throw new AppError('No redirect_uri found in state', 400, 'VALIDATION_ERROR');
    }

    // Exchange code for tokens
    const entry = getProvider(providerName)!;
    const tokens = await entry.oauth.exchangeCode(code);

    // If a webhook_url was provided, trigger background sync of all resources
    if (webhookUrl) {
      triggerBackgroundSync({
        providerName: providerName as ProviderName,
        accessToken: tokens.access_token,
        webhookUrl,
        state: dashboardState,
      });
    }

    // Return an auto-submitting POST form so tokens never appear in the URL
    const html = buildAutoPostForm(redirectUri, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || '',
      token_type: tokens.token_type,
      expires_in: String(tokens.expires_in || ''),
      provider: providerName,
      state: dashboardState,
    });

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// ─── API routes (require API key auth) ───────────────────────────────

// GET /oauth/:provider/url — Get authorization URL (JSON API)
router.get('/:provider/url', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerName = req.params.provider as string;

    if (!isValidProvider(providerName)) {
      throw new AppError(`Unknown provider: ${providerName}`, 400, 'INVALID_PROVIDER');
    }

    const entry = getProvider(providerName)!;

    if (!entry.oauth.buildAuthUrl) {
      throw new AppError(
        `Provider '${providerName}' does not support OAuth authorization URL generation. ` +
          getAuthExplanation(providerName),
        400,
        'UNSUPPORTED_RESOURCE',
        providerName
      );
    }

    const scopes = req.query.scopes as string | undefined;
    const state = req.query.state as string | undefined;

    const url = entry.oauth.buildAuthUrl({ scopes, state });
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// POST /oauth/:provider/exchange — Exchange authorization code for tokens
router.post('/:provider/exchange', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerName = req.params.provider as string;

    if (!isValidProvider(providerName)) {
      throw new AppError(`Unknown provider: ${providerName}`, 400, 'INVALID_PROVIDER');
    }

    const { code } = req.body;
    if (!code) {
      throw new AppError('Missing "code" in request body', 400, 'VALIDATION_ERROR');
    }

    const entry = getProvider(providerName)!;
    const tokenResponse = await entry.oauth.exchangeCode(code);

    res.json(tokenResponse);
  } catch (err) {
    next(err);
  }
});

// POST /oauth/:provider/refresh — Refresh access token
router.post('/:provider/refresh', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerName = req.params.provider as string;

    if (!isValidProvider(providerName)) {
      throw new AppError(`Unknown provider: ${providerName}`, 400, 'INVALID_PROVIDER');
    }

    const { refresh_token } = req.body;

    const entry = getProvider(providerName)!;
    const tokenResponse = await entry.oauth.refreshToken(refresh_token || '');

    res.json(tokenResponse);
  } catch (err) {
    next(err);
  }
});

// POST /oauth/:provider/revoke — Revoke token
router.post('/:provider/revoke', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providerName = req.params.provider as string;

    if (!isValidProvider(providerName)) {
      throw new AppError(`Unknown provider: ${providerName}`, 400, 'INVALID_PROVIDER');
    }

    const entry = getProvider(providerName)!;

    if (!entry.oauth.revokeToken) {
      throw new AppError(
        `Provider '${providerName}' does not support token revocation. ` +
          getAuthExplanation(providerName),
        400,
        'UNSUPPORTED_RESOURCE',
        providerName
      );
    }

    const { token } = req.body;
    if (!token) {
      throw new AppError('Missing "token" in request body', 400, 'VALIDATION_ERROR');
    }

    await entry.oauth.revokeToken(token);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────

function getAuthExplanation(provider: string): string {
  switch (provider) {
    case 'briox':
      return 'Briox uses application tokens exchanged via the /exchange endpoint.';
    case 'bokio':
      return 'Bokio uses static API tokens that never expire. No OAuth flow is needed.';
    case 'bjornlunden':
      return 'Bjorn Lunden uses client credentials grant. Use the /refresh endpoint to obtain a new token.';
    default:
      return '';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildAutoPostForm(action: string, fields: Record<string, string>): string {
  const hiddenInputs = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
    .join('\n      ');

  return `<!DOCTYPE html>
<html>
<head><title>Connecting...</title></head>
<body>
  <p>Completing connection, please wait...</p>
  <form id="callback-form" method="POST" action="${escapeHtml(action)}">
      ${hiddenInputs}
  </form>
  <script>document.getElementById('callback-form').submit();</script>
</body>
</html>`;
}

export default router;
