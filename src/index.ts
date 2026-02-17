import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import resourceRoutes from './routes/resources.js';
import oauthRoutes from './routes/oauth.js';

const app = express();

// Global middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

// Debug endpoint to display OAuth tokens (dev only)
if (env.NODE_ENV !== 'production') {
  app.post('/debug/tokens', express.urlencoded({ extended: false }), (_req, res) => {
    const { access_token, refresh_token, token_type, expires_in, provider } = _req.body;
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html><head><title>OAuth Tokens</title><style>
  body { font-family: monospace; max-width: 700px; margin: 40px auto; padding: 0 20px; }
  pre { background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; }
  h1 { font-size: 1.3em; }
</style></head><body>
  <h1>OAuth tokens received from ${provider || 'unknown'}</h1>
  <pre>${JSON.stringify({ access_token, refresh_token, token_type, expires_in, provider }, null, 2)}</pre>
  <p>Copy these values and use <code>access_token</code> as your <code>X-Provider-Token</code> header.</p>
</body></html>`);
  });
}

// API routes
app.use('/v1/oauth', oauthRoutes);
app.use('/v1', resourceRoutes);

// Global error handler
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Unified ERP API running on port ${env.PORT} (${env.NODE_ENV})`);
});

export default app;
