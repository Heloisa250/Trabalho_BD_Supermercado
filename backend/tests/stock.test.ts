import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { authService } from '../src/modules/auth/service.js';
import type { Employee } from '../src/modules/auth/repository.js';

test('estoque oficial protege recebimento integral, rollback e alterações concorrentes', async context => {
  const origin = 'http://127.0.0.1:5176';
  const secret = 'segredo-isolado-para-testes-de-estoque';
  const auth = authService({ byMatricula: async () => undefined,
    byId: async id => ({ id, matricula: id === 1 ? 'ADMIN' : 'OPERADOR' }) as Employee }, secret, 300, true);
  type Lot = { id: number; product: number; order: number | null; code: string; balance: string; initial: string; cost: string; dates: unknown[] };
  type Movement = { id: number; lot: number; employee: number; type: string; amount: string };
  let state = { status: 'ENVIADO', received: null as string | null, lots: [] as Lot[], movements: [] as Movement[] };
  let queue = Promise.resolve();
  let fail = false;
  const reads: { sql: string; args: unknown[] }[] = [];
  const pool = {
    async execute(sql: string, args: unknown[]) { reads.push({ sql, args }); return [[]]; },
    async getConnection() {
      let snapshot: typeof state;
      let unlock: () => void;
      return {
        async execute(sql: string, args: unknown[] = []) {
          if (sql.includes('GET_LOCK')) {
            assert.deepEqual(args, ['sqlider:Supermercado:estoque']);
            const previous = queue;
            queue = new Promise<void>(resolve => { unlock = resolve; });
            await previous;
            return [[{ acquired: 1 }]];
          }
          if (sql.includes('RELEASE_LOCK')) { unlock(); return [[{ released: 1 }]]; }
          if (sql.includes('MAX(id_lote)')) return [[{ maxId: state.lots.length }]];
          if (sql.includes('MAX(id_movimentacao)')) return [[{ maxId: state.movements.length }]];
          if (sql.includes('FROM pedido_compra')) return [args[0] === 6
            ? [{ status: state.status, data_recebimento: state.received, hoje: '2026-11-10' }] : []];
          if (sql.includes('FROM item_pedido_compra')) return [[{ id_produto: 6, quantidade: '1.125', custo_unitario: '13.37' }]];
          if (sql.includes('FROM produto WHERE')) return [args[0] === 6 ? [{ hoje: '2026-11-10' }] : []];
          if (sql.includes('WHERE id_pedido=? LIMIT')) return [state.lots.filter(lot => lot.order === args[0])];
          if (sql.includes('WHERE id_produto=? AND codigo_lote=?')) return [state.lots.filter(lot => lot.product === args[0] && lot.code === args[1])];
          if (sql.startsWith('SELECT quantidade_atual')) return [state.lots.filter(lot => lot.id === args[0]).map(lot => ({ quantidade_atual: lot.balance }))];
          if (sql.startsWith('INSERT INTO lote')) {
            state.lots.push({ id: Number(args[0]), product: Number(args[1]), order: args[2] as number | null, code: String(args[3]),
              initial: String(args[6]), balance: String(args[7]), cost: String(args[8]), dates: args.slice(4, 6) });
            return [{}];
          }
          if (sql.startsWith('INSERT INTO movimentacao_estoque')) {
            if (fail && state.movements.length === 1) throw new Error('falha no segundo lote');
            state.movements.push({ id: Number(args[0]), lot: Number(args[1]), employee: Number(args[2]), type: String(args[3]), amount: String(args[4]) });
            return [{}];
          }
          if (sql.startsWith('UPDATE pedido_compra')) { state.status = 'RECEBIDO'; state.received = '2026-11-10 10:00:00'; return [{}]; }
          if (sql.startsWith('UPDATE lote')) { state.lots.find(lot => lot.id === args[1])!.balance = String(args[0]); return [{}]; }
          throw new Error('SQL inesperado');
        },
        async beginTransaction() { snapshot = structuredClone(state); },
        async commit() {},
        async rollback() { state = snapshot; },
        release() {},
      };
    },
  } as unknown as Pool;
  const app = createApp({ corsOrigin: origin, database: pool, official: true, admins: ['ADMIN'],
    checkDatabase: async () => {}, auth: { service: auth, ttl: 300, secure: false } });
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1/';
  const cookie = (id: number) => auth.cookieName + '=' + jwt.sign({}, secret, { subject: String(id),
    issuer: 'supermercado-qualidade-lider', audience: 'funcionario-oficial', expiresIn: 300 });
  const send = (path: string, body?: object, actor = 1, source = origin) => fetch(base + path, {
    method: body ? 'POST' : 'GET', headers: { Cookie: actor ? cookie(actor) : '', Origin: source, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const first = { id_produto: 6, codigo_lote: 'A', quantidade: '0.625', data_fabricacao: '2026-11-09', data_validade: '2026-12-10' };
  const second = { id_produto: 6, codigo_lote: 'B', quantidade: '0.500', data_validade: '2027-01-01' };
  const body = { lotes: [first, second] };
  const receive = 'pedidos-compra/6/receber';
  assert.equal((await send(receive, body, 0)).status, 401);
  assert.equal((await send(receive, body, 2)).status, 403);
  assert.equal((await send(receive, body, 1, 'https://externo.invalid')).status, 403);
  assert.equal((await send('pedidos-compra/99/receber', body)).status, 404);
  for (const status of ['PENDENTE','CANCELADO','RECEBIDO']) {
    state.status = status;
    assert.equal((await send(receive, body)).status, 409);
  }
  state.status = 'ENVIADO';
  for (const lotes of [[first], [first, { ...second, id_produto: 9 }], [first, { ...second, codigo_lote: 'a' }]]) {
    assert.equal((await send(receive, { lotes })).status, 409);
  }
  for (const changes of [{ quantidade: '0' }, { quantidade: '-1' }, { quantidade: '0.6251' },
    { data_validade: '2026-02-30' }, { data_fabricacao: '2026-11-09', data_validade: '2026-11-08' }, { custo_unitario: '1.00' }]) {
    assert.equal((await send(receive, { lotes: [{ ...first, ...changes }, second] })).status, 400);
  }
  fail = true;
  assert.equal((await send(receive, body)).status, 500);
  assert.deepEqual(state, { status: 'ENVIADO', received: null, lots: [], movements: [] });
  fail = false;
  assert.deepEqual((await Promise.all([send(receive, body), send(receive, body)])).map(r => r.status).sort(), [200,409]);
  assert.equal(state.status, 'RECEBIDO');
  assert.deepEqual(state.lots.map(lot => [lot.id,lot.order,lot.initial,lot.cost]), [[1,6,'0.625','13.37'],[2,6,'0.500','13.37']]);
  assert.deepEqual(state.lots.map(lot => lot.dates), [['2026-11-09','2026-12-10'],[null,'2027-01-01']]);
  assert.deepEqual(state.movements.map(m => [m.id,m.employee,m.type,m.amount]), [[1,1,'ENTRADA','0.625'],[2,1,'ENTRADA','0.500']]);
  const entry = { ...first, data_validade: null, codigo_lote: 'C', quantidade: '2.000', custo_unitario: '1.00' };
  assert.equal((await send('estoque/entradas', { ...entry, id_produto: 99 })).status, 404);
  assert.equal((await send('estoque/entradas', entry)).status, 201);
  assert.equal(state.lots[2].order, null);
  assert.deepEqual(state.lots[2].dates, ['2026-11-09',null]);
  assert.equal((await send('estoque/entradas', { ...entry, codigo_lote: 'D', data_fabricacao: null })).status, 201);
  assert.deepEqual(state.lots[3].dates, [null,null]);
  assert.equal((await send('estoque/entradas', entry)).status, 409);
  const losses = await Promise.all([send('lotes/3/perdas', { quantidade: '1.500', motivo: 'Quebra' }),
    send('lotes/3/perdas', { quantidade: '1.500', motivo: 'Quebra' })]);
  assert.deepEqual(losses.map(r => r.status).sort(), [201,409]);
  assert.equal((await send('lotes/3/ajustes', { saldo: '1.000', motivo: 'Contagem' })).status, 201);
  assert.equal((await send('lotes/3/ajustes', { saldo: '0.250', motivo: 'Contagem' })).status, 201);
  assert.deepEqual(state.movements.slice(-3).map(m => [m.type,m.amount]), [['PERDA','1.500'],['AJUSTE','0.500'],['AJUSTE','-0.750']]);
  assert.equal(state.lots[2].initial, '2.000');
  const competing = await Promise.all([
    send('lotes/3/ajustes', { saldo: '1.000', motivo: 'Inventário simultâneo' }),
    send('lotes/3/perdas', { quantidade: '0.125', motivo: 'Perda simultânea' }),
  ]);
  assert.deepEqual(competing.map(response => response.status), [201,201]);
  const [adjustment, loss] = state.movements.slice(-2);
  assert.notEqual(adjustment.id, loss.id);
  assert.equal(state.lots[2].balance, loss.type === 'PERDA' ? '0.875' : '1.000');
  const input = "' OR 1=1 --";
  assert.equal((await send('estoque?faixa=baixo&busca=' + encodeURIComponent(input))).status, 200);
  assert.ok(reads.at(-1)!.args.includes(input) && !reads.at(-1)!.sql.includes(input));
  for (const route of ['estoque?faixa=alto','produtos/6/lotes?validade=sem','lotes?validade=proximo&dias=15','lotes?validade=vencido','estoque/movimentacoes?tipo=PERDA']) {
    assert.equal((await send(route)).status, 200);
  }
});
