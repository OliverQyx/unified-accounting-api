import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getProvider, isValidProvider } from '../providers/registry.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { triggerBackgroundSync } from '../utils/sync.js';
import type { ProviderName } from '../providers/types.js';

const router = Router();

// Rate limit all OAuth routes: 20 requests per minute per IP
router.use(rateLimitMiddleware({ maxRequests: 20, windowMs: 60_000 }));

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

    // Exchange code for tokens
    const entry = getProvider(providerName)!;
    const tokens = await entry.oauth.exchangeCode(code);

    // Decode the state param to find the redirect_uri (set by /connect flow)
    const oauthState = req.query.state as string | undefined;
    let redirectUri: string | undefined;
    let webhookUrl = '';
    let dashboardState = '';

    if (oauthState) {
      try {
        const decoded = JSON.parse(Buffer.from(oauthState, 'base64url').toString('utf-8'));
        redirectUri = decoded.redirect_uri;
        webhookUrl = decoded.webhook_url || '';
        dashboardState = decoded.state || '';
      } catch {
        // State wasn't from the /connect flow — fall through to direct display
      }
    }

    // If a webhook_url was provided, trigger background sync of all resources
    if (webhookUrl) {
      triggerBackgroundSync({
        providerName: providerName as ProviderName,
        accessToken: tokens.access_token,
        webhookUrl,
        state: dashboardState,
      });
    }

    if (redirectUri) {
      // Connect flow: POST tokens to the dashboard's redirect_uri
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
    } else {
      // Manual flow (from /url): display tokens directly
      const tokenJson = JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || '',
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        provider: providerName,
      }, null, 2);
      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html><head><title>OAuth Tokens</title><style>
  body { font-family: monospace; max-width: 700px; margin: 40px auto; padding: 0 20px; }
  pre { background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; }
  h1 { font-size: 1.3em; }
</style></head><body>
  <h1>OAuth tokens received from ${escapeHtml(providerName)}</h1>
  <pre>${escapeHtml(tokenJson)}</pre>
  <p>Copy these values and use <code>access_token</code> as your <code>X-Provider-Token</code> header.</p>
</body></html>`);
    }
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
