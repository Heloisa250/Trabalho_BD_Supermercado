import type { ErrorRequestHandler } from 'express';

export const handleError: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error.type === 'entity.parse.failed') {
    response.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido.' } });
    return;
  }
  if (error.type === 'entity.too.large') {
    response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Corpo excede o limite.' } });
    return;
  }
  console.error('Falha interna.', { requestId: response.getHeader('X-Request-Id') });
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Falha interna.' } });
};
