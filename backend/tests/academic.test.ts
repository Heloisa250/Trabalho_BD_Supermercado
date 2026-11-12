import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { employeeRepository, type Employee } from '../src/modules/auth/repository.js';
import { authService } from '../src/modules/auth/service.js';
import { bucketSql } from '../src/modules/dashboard/period.js';
import { dashboardRepository } from '../src/modules/dashboard/repository.js';

test('login e sessão acadêmicos consultam o grupo e condicionam a administração', async context => {
  const origin = 'http://127.0.0.1:5176';
  const password = 'isolated-test-password';
  const senhaHash = await bcrypt.hash(password, 4);
  let grupo: Employee['grupo'] = 'SUPERVISOR';
  const queries: { sql: string; value: unknown }[] = [];
  const pool = { execute: async ({ sql }: { sql: string }, [value]: unknown[]) => {
    queries.push({ sql, value });
    return [grupo ? [{ id: 2, nome: 'Funcionária fictícia', matricula: 'F0002',
      cargoId: 2, cargoNome: 'Supervisora', podeCancelar: 1, grupo, senhaHash }] : []];
  } } as unknown as Pool;
  const service = authService(employeeRepository(pool, true), 'test-only-local-signing-key-123456789', 1800, true);
  const server = createApp({ corsOrigin: origin, checkDatabase: async () => {}, academic: true,
    admins: ['F0002'], auth: { service, ttl: 1800, secure: false } }).listen(0, '127.0.0.1');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1';
  const login = await fetch(base + '/auth/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula: 'F0002', senha: password }),
  });
  assert.equal(login.status, 200);
  const profile = await login.json();
  assert.equal(profile.grupo, 'SUPERVISOR');
  assert.equal(profile.permissoes.pode_cancelar_item, true);
  assert.ok(!('senhaHash' in profile));
  const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0] };
  const access = async () => (await fetch(base + '/admin/access', { headers })).json();
  assert.deepEqual(await access(), { autorizado: false });
  grupo = 'ADMINISTRADOR';
  assert.deepEqual(await access(), { autorizado: true });
  grupo = undefined;
  assert.equal((await fetch(base + '/auth/me', { headers })).status, 401);
  assert.equal(queries[0].value, 'F0002');
  assert.equal(queries[1].value, 2);
  assert.ok(queries.every(({ sql }) => /JOIN usuarios .*JOIN grupos_usuarios/s.test(sql)));
});

test('série acadêmica parametriza o período e mantém agrupamentos na view de vendas', async () => {
  const range = { desde: '2026-11-03 03:00:00', ate: '2026-11-07 03:00:00' };
  const captured: { sql: string; args: unknown[] }[] = [];
  const pool = { execute: async (sql: string, args: unknown[]) => {
    captured.push({ sql, args });
    return [[{ periodo: '2026-11-03', vendas: 2, faturamento: '62.99' }]];
  } } as unknown as Pool;
  for (const grouping of ['dia', 'semana', 'mes'] as const) {
    const [row] = await dashboardRepository(pool, true).revenueSeries(range, grouping);
    const { sql, args } = captured.at(-1)!;
    assert.match(sql, /FROM vw_vendas_finalizadas/);
    assert.ok(sql.includes(bucketSql('data_hora', grouping)));
    assert.deepEqual(args, [range.desde, range.ate]);
    assert.equal(row.faturamento, '62.99');
  }
});
