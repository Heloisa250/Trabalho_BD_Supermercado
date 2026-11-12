import type { CookieOptions, RequestHandler } from 'express';
import { loginSchema } from './schema.js';
import type { AuthService } from './service.js';

export function authController(service: AuthService, ttl: number, secure: boolean) {
  const cookie: CookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1' };
  const login: RequestHandler = async (request, response) => {
    const input = loginSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Informe matrícula e senha válidas.' } });
      return;
    }
    const session = await service.login(input.data.matricula, input.data.senha);
    if (!session) {
      response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Matrícula ou senha inválida.' } });
      return;
    }
    response.cookie(service.cookieName, session.token, { ...cookie, maxAge: ttl * 1000 });
    response.json(session.employee);
  };

  const me: RequestHandler = (_request, response) => {
    response.json(response.locals.employee);
  };

  const logout: RequestHandler = (_request, response) => {
    response.clearCookie(service.cookieName, cookie);
    response.sendStatus(204);
  };

  return { login, me, logout };
}
