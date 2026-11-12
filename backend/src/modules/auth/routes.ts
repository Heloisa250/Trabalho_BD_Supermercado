import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import { changePassword } from './password.js';
import { rateLimit } from 'express-rate-limit';
import { authController } from './controller.js';
import { requireSession, requireTrustedOrigin } from './middleware.js';
import { AuthDatabaseError, type AuthService } from './service.js';

export interface AuthOptions {
  service: AuthService;
  ttl: number;
  secure: boolean;
}

export function authRoutes(options: AuthOptions, origins: readonly string[], pool?: Pool) {
  const router = Router();
  const controller = authController(options.service, options.ttl, options.secure);
  const trustedOrigin = requireTrustedOrigin(origins);
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde e tente novamente.' } },
  });

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/login', trustedOrigin, limiter, controller.login);
  router.get('/me', requireSession(options.service), controller.me);
  router.post('/logout', trustedOrigin, controller.logout);
  router.post('/change-password', trustedOrigin, requireSession(options.service), rateLimit({
    windowMs: 15 * 60 * 1000, limit: 8, skipSuccessfulRequests: true,
    message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde e tente novamente.' } },
  }), changePassword(pool));
  router.use((error: unknown, _request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) => {
    if (error instanceof AuthDatabaseError) {
      response.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível. Tente novamente.' } });
      return;
    }
    next(error);
  });
  return router;
}
