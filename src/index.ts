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

// API routes
app.use('/v1/oauth', oauthRoutes);
app.use('/v1', resourceRoutes);

// Global error handler
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Unified ERP API running on port ${env.PORT} (${env.NODE_ENV})`);
});

export default app;
