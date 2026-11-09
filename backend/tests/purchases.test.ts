import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { authService } from '../src/modules/auth/service.js';
import type { Employee } from '../src/modules/auth/repository.js';

test('compras HTTP com transações e pool isolado', async (context) => {
  const secret = 'segredo-de-teste-de-compras-isoladas';
  const origin = 'http://127.0.0.1:5175';
  const auth = authService({ byMatricula: async () => undefined,
    byId: async (id) => ({ id, matricula: id === 1 ? 'ADMIN' : 'OPERADOR' }) as Employee }, secret, 300);
  const calls: { sql: string; args: unknown[] }[] = [];
  let status = 'ABERTO';
  let supplier = 1;
  let items = new Map<number, { quantidade: string; custo_unitario: string }>();
  let rollback = 0;
  let released = 0;
  let transactionTail = Promise.resolve();
  async function execute(sql: string, args: unknown[] = []) {
    calls.push({ sql, args });
    if (sql.includes('FROM fornecedor WHERE')) return [args[0] === 9 ? [] : [{ ativo: args[0] === 8 ? 0 : 1 }]];
    if (sql.includes('LEFT JOIN produto_fornecedor')) {
      return [args[1] === 9 ? [] : [{ ativo: args[1] === 8 ? 0 : 1, id_fornecedor: args[1] === 7 ? null : args[0] }]];
    }
    if (sql.startsWith('INSERT INTO pedido_compra')) {
      status = 'ABERTO'; supplier = Number(args[0]); items = new Map();
      return [{ insertId: 1 }];
    }
    if (sql.startsWith('INSERT INTO item_pedido_compra')) {
      const product = Number(args[1]);
      if (items.has(product)) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
      items.set(product, { quantidade: String(args[2]), custo_unitario: String(args[3]) });
      return [{}];
    }
    if (sql.startsWith('UPDATE pedido_compra')) {
      if (sql.includes('status=?')) status = String(args[0]);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE item_pedido_compra')) {
      const product = Number(args.at(-1));
      const line = items.get(product);
      if (!line) return [{ affectedRows: 0 }];
      sql.split(' SET ')[1].split(' WHERE ')[0].split(',').forEach((field, index) => {
        const key = field.split('=')[0] as keyof typeof line;
        line[key] = String(args[index]);
      });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT id_produto FROM item')) return [items.size ? [{ id_produto: 1 }] : []];
    if (sql.includes('FROM item_pedido_compra i JOIN')) return [[...items.values()]];
    if (sql.startsWith('SELECT pc.') || sql.startsWith('SELECT id_fornecedor,status')) return [[{ id_pedido: 1, id_fornecedor: supplier, status }]];
    return [[]];
  }
  const database = { execute, getConnection: async () => {
    let unlock: () => void;
    let previous: { status: string; supplier: number; items: typeof items };
    return {
      execute,
      async beginTransaction() {
        const pending = transactionTail;
        transactionTail = new Promise<void>((resolve) => { unlock = resolve; });
        await pending;
        previous = { status, supplier, items: new Map([...items].map(([id, line]) => [id, { ...line }])) };
      },
      async commit() {},
      async rollback() { rollback++; ({ status, supplier, items } = previous); },
      release() { released++; unlock(); },
    };
  } } as unknown as Pool;
  const server = createApp({ corsOrigin: origin, checkDatabase: async () => {}, database, admins: ['ADMIN'],
    auth: { service: auth, ttl: 300, secure: false } }).listen(0, '127.0.0.1');
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1/pedidos-compra';
  const cookie = (id: number) => 'sqlider_session=' + jwt.sign({}, secret, {
    subject: String(id), issuer: 'supermercado-qualidade-lider', audience: 'funcionario', expiresIn: 300,
  });
  async function send(path: string, expected: number | number[], method = 'GET', data?: object, token = cookie(1), source = origin) {
    const result = await fetch(base + path, { method, headers: { Cookie: token, Origin: source, 'Content-Type': 'application/json' },
      body: data && JSON.stringify(data) });
    assert.ok([expected].flat().includes(result.status), method + ' ' + path + ' HTTP ' + result.status);
    return result.json();
  }
  const order = { id_fornecedor: 1, data_prevista: '2026-11-20' };
  const line = { id_produto: 1, quantidade: '1.005', custo_unitario: '12.30' };
  await send('', 401, 'GET', undefined, '');
  await send('', 403, 'GET', undefined, cookie(2));
  await send('', 403, 'POST', order, cookie(1), 'https://externo.invalid');
  await send('', 400, 'POST', { ...order, id_funcionario: 99 });
  await send('', 400, 'POST', { ...order, data_prevista: '2026-02-30' });
  await send('', 409, 'POST', { id_fornecedor: 9 });
  await send('', 409, 'POST', { id_fornecedor: 8 });
  await send('', 201, 'POST', order);
  assert.deepEqual(calls.find((call) => call.sql.startsWith('INSERT INTO pedido_compra'))?.args, [1, 1, '2026-11-20', null]);
  await send('/1/enviar', 409, 'POST');
  for (const id_produto of [7, 8, 9]) await send('/1/itens', 409, 'POST', { ...line, id_produto });
  for (const quantidade of ['0', '-1', '0.0001']) await send('/1/itens', 400, 'POST', { ...line, quantidade });
  await send('/1/itens', 400, 'POST', { ...line, custo_unitario: '1.005' });
  await send('/1/itens', 201, 'POST', line);
  assert.equal(items.get(1)?.custo_unitario, '12.30');
  await send('/1/itens', 409, 'POST', line);
  await send('/1', 409, 'PATCH', { id_fornecedor: 2 });
  await send('/1/itens/1', 200, 'PATCH', { quantidade: '2.005', custo_unitario: '13.01' });
  assert.deepEqual(items.get(1), { quantidade: '2.005', custo_unitario: '13.01' });
  await send('/1', 400, 'PATCH', { status: 'RECEBIDO' });
  await send('/1/enviar', 200, 'POST');
  await send('/1/itens/1', 409, 'PATCH', { quantidade: '3' });
  await send('/1/cancelar', 200, 'POST');
  await send('/1/cancelar', 409, 'POST');
  await send('/1/enviar', 409, 'POST');
  status = 'RECEBIDO';
  await send('/1/cancelar', 409, 'POST');
  await send('', 409, 'POST', { ...order, itens: [line, line] });
  assert.equal(status, 'RECEBIDO');
  assert.deepEqual(items.get(1), { quantidade: '2.005', custo_unitario: '13.01' });
  assert.ok(rollback > 0 && released > rollback);
  await send('', 201, 'POST', { ...order, itens: [line] });
  const competing = await Promise.all([send('/1/enviar', [200, 409], 'POST'), send('/1/enviar', [200, 409], 'POST')]);
  assert.equal(competing.filter((result) => result.status === 'ENVIADO').length, 1);
  assert.equal(competing.filter((result) => result.error?.code === 'ORDER_NOT_OPEN').length, 1);
  assert.equal(status, 'ENVIADO');
  await send('', 201, 'POST', order);
  await send('/1/cancelar', 200, 'POST');
  const attack = "' OR 1=1 --";
  await send('/fornecedor/1/produtos?busca=' + encodeURIComponent(attack), 200);
  assert.ok(!calls.at(-1)!.sql.includes(attack));
  assert.deepEqual(calls.at(-1)!.args, [1, attack, attack, 0]);
  await send('?ordem=' + encodeURIComponent(attack), 400);
  assert.ok(calls.some((call) => call.sql.includes('FOR UPDATE')));
  assert.ok(calls.some((call) => call.sql.includes('SUM(ROUND(i.quantidade * i.custo_unitario, 2))')));
  assert.ok(calls.every((call) => !/\b(lote|movimentacao_estoque)\b/.test(call.sql)));
});
