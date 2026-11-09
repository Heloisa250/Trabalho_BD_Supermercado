import { randomUUID } from 'node:crypto';
import cors from 'cors';
import type { Pool } from 'mysql2/promise';
import { adminRoutes } from './modules/admin/routes.js';
import { authRoutes, type AuthOptions } from './modules/auth/routes.js';
import express from 'express';
import helmet from 'helmet';
import { handleError } from './middlewares/errors.js';
import { healthRoutes } from './routes/health.js';

export function createApp(options: { corsOrigin: string | string[]; checkDatabase: () => Promise<void>; auth?: AuthOptions; database?: Pool; admins?: readonly string[]; official?: boolean }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader('X-Request-Id', randomUUID());
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: [options.corsOrigin].flat(), credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', healthRoutes(options.checkDatabase));
  if (options.auth) {
    const origins = [options.corsOrigin].flat();
    app.use('/api/v1/auth', authRoutes(options.auth, origins, options.database));
    app.use('/api/v1', adminRoutes(options.auth.service, options.database, options.admins ?? [], origins, options.official));
  }
  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
  });
  app.use(handleError);
  return app;
}
