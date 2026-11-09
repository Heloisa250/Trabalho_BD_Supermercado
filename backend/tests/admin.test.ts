import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { authService } from '../src/modules/auth/service.js';
import type { Employee } from '../src/modules/auth/repository.js';

test('administração HTTP com pool isolado e consultas inspecionadas', async (context) => {
  const origin = 'http://127.0.0.1:5175';
  let hash = await bcrypt.hash('SenhaAnterior!2026', 4);
  const employees = ['ADMIN-TESTE', 'SUP-TESTE'].map((matricula, index) => ({
    id: index + 1, matricula, nome: matricula, cargoId: 1, cargoNome: 'Cargo', podeCancelar: 1, senhaHash: hash,
  }) as unknown as Employee);
  const service = authService({
    byMatricula: async (value) => employees.find((row) => row.matricula === value),
    byId: async (id) => employees.find((row) => row.id === id),
  }, 'segredo-apenas-para-teste-de-integracao', 1800);

  let queryError: { code: string; sqlMessage?: string } | undefined;
  let openSession = false;
  let rolledBack = false;
  let calls: { sql: string; values: unknown[] }[] = [];
  async function execute(sql: string, values: unknown[]) {
    calls.push({ sql, values });
    if (queryError && sql.startsWith('INSERT')) throw queryError;
    if (sql.startsWith('SELECT senha_hash')) return [[{ senha_hash: hash }]];
    if (sql.startsWith('UPDATE funcionario SET senha_hash')) {
      assert.deepEqual(values.slice(1), [1, hash]);
      hash = String(values[0]);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT')) return [{ insertId: 7 }];
    if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
    if (sql.includes('FROM sessao_caixa')) return [openSession ? [{ id_sessao: 5 }] : []];
    return [[{ id: 7, matricula: 'NOVO', data_admissao: '2026-01-01' }]];
  }
  const database = {
    execute,
    getConnection: async () => ({
      execute, beginTransaction: async () => {}, commit: async () => {},
      rollback: async () => { rolledBack = true; }, release: () => {},
    }),
  } as unknown as Pool;
  const server = createApp({
    corsOrigin: origin, checkDatabase: async () => {}, database, admins: ['ADMIN-TESTE'],
    auth: { service, ttl: 1800, secure: false },
  }).listen(0, '127.0.0.1');
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1/';
  const send = (path: string, method = 'GET', body?: object, cookie = '', source = origin) => fetch(base + path, {
    method, headers: { Origin: source, Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  async function login(matricula: string) {
    const response = await send('auth/login', 'POST', { matricula, senha: 'SenhaAnterior!2026' });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie')!.split(';')[0];
  }

  const admin = await login('ADMIN-TESTE');
  const supervisor = await login('SUP-TESTE');
  assert.equal((await send('funcionarios')).status, 401);
  assert.equal((await send('funcionarios', 'GET', undefined, supervisor)).status, 403);
  assert.deepEqual(await (await send('admin/access', 'GET', undefined, supervisor)).json(), { autorizado: false });

  const employee = { nome: 'Teste', cpf: '12345678909', matricula: 'NOVO', id_cargo: 1,
    salario: '2000.00', data_admissao: '2026-01-01', senha: 'SenhaForte!2026' };
  assert.equal((await send('funcionarios', 'POST', { ...employee, admin: true }, admin)).status, 400);
  assert.equal((await send('funcionarios', 'POST', { ...employee, matricula: 'ADMIN-TESTE' }, admin)).status, 409);
  assert.equal((await send('funcionarios', 'POST', employee, admin, 'https://outro.invalid')).status, 403);
  assert.equal((await send('funcionarios', 'POST', employee, admin)).status, 201);
  const insert = calls.find((entry) => entry.sql.startsWith('INSERT INTO funcionario'));
  assert.ok(insert);
  assert.ok(await bcrypt.compare(employee.senha, String(insert.values.at(-1))));
  assert.ok(!insert.sql.includes(employee.cpf));
  for (const index of ['cpf', 'matricula']) {
    queryError = { code: 'ER_DUP_ENTRY', sqlMessage: 'uq_funcionario_' + index };
    const duplicate = await send('funcionarios', 'POST', employee, admin);
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json()).error.message, new RegExp(index));
  }
  queryError = { code: 'ER_NO_REFERENCED_ROW_2' };
  assert.equal((await send('funcionarios', 'POST', { ...employee, id_cargo: 999 }, admin)).status, 409);
  queryError = undefined;

  assert.equal((await send('funcionarios/7', 'PATCH', { nome: 'Editado' }, admin)).status, 200);
  assert.equal((await send('funcionarios/7/status', 'PATCH', { ativo: false }, admin)).status, 200);
  assert.equal((await send('cargos', 'POST', { nome: 'Liderança', pode_cancelar_item: true }, admin)).status, 201);
  assert.equal((await send('cargos/7', 'PATCH', { pode_cancelar_item: false }, admin)).status, 200);
  assert.equal((await send('caixas', 'POST', { numero: 20 }, admin)).status, 201);
  queryError = { code: 'ER_DUP_ENTRY', sqlMessage: 'uq_caixa_numero' };
  assert.equal((await send('caixas', 'POST', { numero: 20 }, admin)).status, 409);
  queryError = undefined;
  openSession = true;
  assert.equal((await send('caixas/7/status', 'PATCH', { ativo: false }, admin)).status, 409);
  assert.equal(rolledBack, true);
  openSession = false;
  for (const ativo of [false, true]) {
    assert.equal((await send('caixas/7/status', 'PATCH', { ativo }, admin)).status, 200);
  }
  assert.equal((await send('formas-pagamento', 'POST', { descricao: 'Dinheiro', permite_troco: 2 }, admin)).status, 400);
  assert.equal((await send('formas-pagamento', 'POST', { descricao: 'Dinheiro', permite_troco: true }, admin)).status, 201);

  const attack = "' OR 1=1 --";
  calls = [];
  assert.equal((await send('funcionarios?busca=' + encodeURIComponent(attack), 'GET', undefined, admin)).status, 200);
  assert.ok(!calls[0].sql.includes(attack));
  assert.equal(calls[0].values[0], attack);
  assert.equal((await send('auth/change-password', 'POST', { senhaAtual: 'SenhaAnterior!2026', novaSenha: 'fraca' }, admin)).status, 400);
  assert.equal((await send('auth/change-password', 'POST', { senhaAtual: 'incorreta', novaSenha: 'NovaSenhaForte!2026' }, admin)).status, 401);
  assert.equal((await send('auth/change-password', 'POST', { senhaAtual: 'SenhaAnterior!2026', novaSenha: 'NovaSenhaForte!2026' }, admin)).status, 204);
  assert.ok(await bcrypt.compare('NovaSenhaForte!2026', hash));
});
