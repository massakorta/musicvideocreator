import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { requireSession } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { internalRouter } from './routes/internal.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: [config.appUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'api' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/internal', internalRouter);

  const aiLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.aiRateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message: 'Too many AI requests. Wait a moment and try again.' },
  });

  app.use('/api', requireSession);
  app.use(['/api/projects/:id/visual-bible', '/api/projects/:id/storyboard', '/api/projects/:id/scenes', '/api/projects/:id/images', '/api/projects/:id/characters'], aiLimiter);
  app.use('/api', apiRouter);
  app.use(errorHandler);
  return app;
}
