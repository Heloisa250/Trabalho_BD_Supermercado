import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';

test('liveness, readiness, CORS e erros HTTP', async (context) => {
  const corsOrigin = 'http://localhost:5173';
  let available = true;
  const server = createApp({
    corsOrigin,
    checkDatabase: async () => {
      if (!available) throw new Error('Detalhe privado');
    },
  }).listen(0, '127.0.0.1');
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, 'listening');

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port + '/api/v1';

  const live = await fetch(url + '/health', { headers: { Origin: corsOrigin } });
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('access-control-allow-origin'), corsOrigin);
  assert.equal(live.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await live.json(), { status: 'ok' });

  const ready = await fetch(url + '/ready');
  assert.deepEqual(await ready.json(), { status: 'ready' });
  available = false;
  const unavailable = await fetch(url + '/ready');
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' },
  });

  const missing = await fetch(url + '/missing');
  assert.equal(missing.status, 404);
  await missing.json();
  const invalid = await fetch(url + '/missing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_JSON');
});
