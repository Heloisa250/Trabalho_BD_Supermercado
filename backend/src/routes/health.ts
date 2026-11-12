import { Router } from 'express';

export function healthRoutes(checkDatabase: () => Promise<void>) {
  const router = Router();
  router.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  router.get('/ready', async (_request, response) => {
    try {
      await checkDatabase();
      response.json({ status: 'ready' });
    } catch {
      response.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    }
  });
  return router;
}
