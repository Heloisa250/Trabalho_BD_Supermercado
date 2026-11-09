import type { RequestHandler } from 'express';
import type { AuthService, PublicEmployee } from './service.js';
import { canCancelItem } from './service.js';

export function requireSession(service: AuthService): RequestHandler {
  return async (request, response, next) => {
    const prefix = service.cookieName + '=';
    const cookie = request.headers.cookie?.split(';').map((entry) => entry.trim())
      .find((entry) => entry.startsWith(prefix));
    const employee = cookie && await service.session(cookie.slice(prefix.length));
    if (!employee) {
      response.status(401).json({ error: { code: 'SESSION_REQUIRED', message: 'Entre para continuar.' } });
      return;
    }
    response.locals.employee = employee;
    next();
  };
}

export const requireCancellationPermission: RequestHandler = (_request, response, next) => {
  const employee: PublicEmployee | undefined = response.locals.employee;
  if (!employee || !canCancelItem(employee)) {
    response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Permissão insuficiente.' } });
    return;
  }
  next();
};

export function requireTrustedOrigin(origins: readonly string[]): RequestHandler {
  return (request, response, next) => {
    const origin = request.get('Origin');
    if (!origin || !origins.includes(origin)) {
      response.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origem não autorizada.' } });
      return;
    }
    next();
  };
}
