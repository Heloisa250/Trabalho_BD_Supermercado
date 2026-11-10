import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { fakeDatabase, rejects } from './helpers/sales-fake.js';
import { authService } from '../src/modules/auth/service.js';
import type { Employee } from '../src/modules/auth/repository.js';
import { cents, milli, moneyText, subtotal } from '../src/modules/sales/decimal.js';




test('aritmética decimal exata para subtotais', () => {
  assert.equal(moneyText(subtotal(milli('1.250'), cents('6.99'))), '8.74'); // 8.7375 → 8.74
  assert.equal(moneyText(subtotal(milli('3'), cents('2.79'))), '8.37');
  assert.equal(moneyText(subtotal(milli('0.333'), cents('0.10'))), '0.03');
  assert.equal(moneyText(subtotal(milli('0.005'), cents('1.00'))), '0.01'); // meio para cima
  assert.equal(moneyText(subtotal(milli('3'), cents('0.10')) + subtotal(milli('3'), cents('0.20'))), '0.90'); // 0.1+0.2 sem erro binário
  assert.throws(() => milli('1.0001'));
});

test('abertura de venda: sessão real do JWT, ID explícito, uma ABERTA por sessão', async () => {
  const { state, service, counters } = fakeDatabase();
  await rejects(service.open(4), 403, 'INACTIVE_OPERATOR');
  await rejects(service.open(2), 409, 'NO_OPEN_SESSION');
  await rejects(service.open(9), 409, 'INACTIVE_TERMINAL');
  state.sessions.get(5)!.data_fechamento = '2026-11-10 14:00:00';
  await rejects(service.open(1), 409, 'NO_OPEN_SESSION');
  state.sessions.get(5)!.data_fechamento = null;
  // Três pedidos simultâneos (duplo clique/reenvio): uma única venda é criada; os demais recuperam a mesma.
  const before = state.sales.size;
  const results = await Promise.all([service.open(1), service.open(1), service.open(1)]);
  assert.equal(state.sales.size, before + 1);
  assert.deepEqual(results.map(r => r.id_venda), [6, 6, 6]);
  assert.deepEqual(results.map(r => r.recuperada).sort(), [false, true, true]);
  const sale = results.find(r => !r.recuperada)!;
  assert.equal(sale.id_venda, 6);
  assert.equal(sale.id_sessao, 5);
  assert.equal(sale.status, 'ABERTA');
  assert.equal(sale.valor_total, '0.00');
  assert.equal(sale.numero_caixa, 2);
  assert.deepEqual(state.sales.get(5), { id_venda: 5, id_sessao: 3, data_hora: '2026-11-06 15:30:00', valor_total: '38.89', status: 'ABERTA' });
  assert.equal((await service.active(1)).venda?.id_venda, 6);
  assert.equal((await service.active(2)).sessao, null);
  const { locks, releases } = counters();
  assert.equal(locks, releases);
});

test('itens: código de barras, quantidades, estoque vendável, preço snapshot e totais', async () => {
  const { state, service } = fakeDatabase();
  const { id_venda: sale } = await service.open(1);
  await rejects(service.addItem(sale, 1, { codigo_barras: '41111026', quantidade: '1' }), 404, 'PRODUCT_NOT_FOUND');
  assert.equal((await service.lookup({ codigo_barras: '000041111026' }))[0].codigo_barras, '000041111026');
  await rejects(service.lookup({ codigo_barras: '999' }), 404);
  await rejects(service.addItem(sale, 1, { id_produto: 8, quantidade: '1' }), 409, 'INACTIVE_PRODUCT');
  await rejects(service.addItem(sale, 1, { codigo_barras: '7891234500059', quantidade: '1' }), 409, 'INSUFFICIENT_STOCK'); // só lote vencido
  for (const q of ['0', '0.000']) await rejects(service.addItem(sale, 1, { id_produto: 1, quantidade: q }), 400, 'INVALID_QUANTITY');
  await rejects(service.addItem(sale, 1, { id_produto: 1, quantidade: '1.5' }), 400, 'INVALID_QUANTITY'); // UN fracionado
  await rejects(service.addItem(sale, 1, { id_produto: 1, quantidade: '98' }), 409, 'INSUFFICIENT_STOCK');
  let view = await service.addItem(sale, 1, { codigo_barras: '7891234500011', quantidade: '2' });
  assert.equal(view.valor_total, '57.80');
  view = await service.addItem(sale, 1, { id_produto: 6, quantidade: '1.125' }); // KG fracionado
  assert.equal(view.itens[1].subtotal, '23.70'); // 23.70375
  view = await service.addItem(sale, 1, { id_produto: 7, quantidade: '1.5' }); // L fracionado
  assert.equal(view.itens[2].subtotal, '7.49'); // 7.485 → 7.49
  assert.equal(view.valor_total, '88.99');
  await rejects(service.addItem(sale, 1, { id_produto: 6, quantidade: '1.601' }), 409, 'INSUFFICIENT_STOCK'); // 1.125 já no carrinho
  // adição repetida soma na mesma linha
  view = await service.addItem(sale, 1, { id_produto: 1, quantidade: '1' });
  assert.equal(view.itens.length, 3);
  assert.equal(view.itens[0].quantidade, '3.000');
  assert.equal(view.itens[0].subtotal, '86.70');
  // preço muda no cadastro: item antigo preservado, nova linha com novo preço
  state.products.get(1)!.preco_venda = '30.00';
  view = await service.addItem(sale, 1, { id_produto: 1, quantidade: '1' });
  assert.equal(view.itens[0].preco_unitario, '28.90');
  assert.equal(view.itens[3].preco_unitario, '30.00');
  assert.equal(view.valor_total, moneyText(cents('86.70') + cents('23.70') + cents('7.49') + cents('30.00')));
  // edição preserva preço histórico
  view = await service.updateItem(sale, view.itens[0].id_item_venda, 1, '1');
  assert.equal(view.itens[0].subtotal, '28.90');
  assert.equal(view.valor_total, '90.09');
  await rejects(service.updateItem(sale, 999, 1, '1'), 404);
  await rejects(service.updateItem(sale, view.itens[0].id_item_venda, 1, '0'), 400);
  await rejects(service.updateItem(sale, view.itens[0].id_item_venda, 1, '97'), 409, 'INSUFFICIENT_STOCK'); // 96+1 de outra linha
  // rollback: falha no INSERT não deixa item nem total alterado
  state.failNextInsert = true;
  state.products.get(7)!.preco_venda = '5.00'; // força nova linha (INSERT)
  await assert.rejects(service.addItem(sale, 1, { id_produto: 7, quantidade: '0.5' }));
  state.products.get(7)!.preco_venda = '4.99';
  assert.equal(state.sales.get(sale)!.valor_total, '90.09');
  assert.equal(state.failNextInsert, false);
  // venda de outro operador e item de outra venda
  await rejects(service.addItem(sale, 3, { id_produto: 1, quantidade: '1' }), 403);
  await rejects(service.detail(5, 1), 403);
  await rejects(service.updateItem(sale, 999, 3, '1'), 403);
  // concorrência: inclusões simultâneas do mesmo produto não duplicam linha nem perdem quantidade
  const before = state.items.size;
  await Promise.all([1, 2, 3].map(() => service.addItem(sale, 1, { id_produto: 7, quantidade: '1' })));
  assert.equal(state.items.size, before);
  assert.equal([...state.items.values()].find(i => i.id_produto === 7)!.quantidade, '4.500');
  // sessão fechada concorrentemente bloqueia gravações
  state.sessions.get(5)!.data_fechamento = '2026-11-10 18:00:00';
  await rejects(service.addItem(sale, 1, { id_produto: 7, quantidade: '1' }), 409, 'SESSION_CLOSED');
});

test('cancelamento de item exige supervisor autenticado distinto, é único e auditável', async () => {
  const { state, service } = fakeDatabase();
  const { id_venda: sale } = await service.open(1);
  let view = await service.addItem(sale, 1, { id_produto: 1, quantidade: '2' });
  view = await service.addItem(sale, 1, { id_produto: 7, quantidade: '1' });
  const item = view.itens[0].id_item_venda;
  const ask = (matricula: string, senha: string) => service.cancelItem(sale, item, 1, { motivo: 'Cliente desistiu', supervisor: { matricula, senha } });
  await rejects(ask('F0002', 'errada'), 403, 'INVALID_SUPERVISOR');
  await rejects(ask('F9999', 'senha-correta-2'), 403, 'INVALID_SUPERVISOR');
  await rejects(ask('F0003', 'senha-correta-3'), 403, 'SUPERVISOR_NOT_ALLOWED');
  await rejects(ask('F0001', 'senha-correta-1'), 403, 'SAME_PERSON');
  state.failNextInsert = true;
  await assert.rejects(ask('F0002', 'senha-correta-2'));
  assert.equal(state.cancellations.size, 0);
  assert.equal(state.sales.get(sale)!.valor_total, '62.79');
  const results = await Promise.allSettled([ask('F0002', 'senha-correta-2'), ask('F0002', 'senha-correta-2')]);
  assert.deepEqual(results.map(r => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(state.cancellations.size, 1);
  const [audit] = state.cancellations.values();
  assert.deepEqual(audit, { id_item_venda: item, id_supervisor: 2, motivo: 'Cliente desistiu' });
  view = await service.detail(sale, 1);
  assert.equal(view.itens[0].situacao, 'CANCELADO');
  assert.equal(view.itens[0].subtotal, '57.80'); // histórico preservado
  assert.equal(view.itens[0].cancelamento?.supervisor, 'F0002');
  assert.equal(view.valor_total, '4.99');
  assert.equal(view.itens_ativos, 1);
  await rejects(ask('F0002', 'senha-correta-2'), 409, 'ITEM_CANCELLED');
  await rejects(service.updateItem(sale, item, 1, '1'), 409, 'ITEM_CANCELLED');
  // novo item do mesmo produto não reativa o cancelado
  view = await service.addItem(sale, 1, { id_produto: 1, quantidade: '1' });
  assert.equal(view.itens.length, 3);
  assert.equal(view.valor_total, '33.89');
  // venda finalizada/cancelada não aceita cancelamento
  state.sales.get(sale)!.status = 'FINALIZADA';
  await rejects(ask('F0002', 'senha-correta-2'), 409, 'SALE_NOT_OPEN');
  state.sales.get(sale)!.status = 'CANCELADA';
  await rejects(service.cancelItem(sale, view.itens[2].id_item_venda, 1, { motivo: 'teste', supervisor: { matricula: 'F0002', senha: 'senha-correta-2' } }), 409, 'SALE_NOT_OPEN');
});

test('cancelamento da venda aberta preserva itens e respeita pagamentos e movimentações', async () => {
  const { state, service } = fakeDatabase();
  const { id_venda: sale } = await service.open(1);
  await service.addItem(sale, 1, { id_produto: 1, quantidade: '1' });
  await rejects(service.cancelSale(sale, 3), 403);
  state.payments.add(sale);
  await rejects(service.cancelSale(sale, 1), 409, 'SALE_HAS_PAYMENTS');
  state.payments.clear(); state.movements.add(sale);
  await rejects(service.cancelSale(sale, 1), 409, 'SALE_HAS_MOVEMENTS');
  state.movements.clear();
  const view = await service.cancelSale(sale, 1);
  assert.equal(view.status, 'CANCELADA');
  assert.equal(view.itens.length, 1);
  await rejects(service.cancelSale(sale, 1), 409, 'SALE_NOT_OPEN');
  await rejects(service.addItem(sale, 1, { id_produto: 1, quantidade: '1' }), 409, 'SALE_NOT_OPEN');
  assert.equal(state.sales.get(5)!.status, 'ABERTA'); // venda histórica intocada
  assert.equal((await service.open(1)).status, 'ABERTA'); // nova venda permitida
});

test('rotas do PDV: autenticação, CSRF, schemas estritos e injeção', async context => {
  const secret = 'segredo-isolado-apenas-para-teste-de-pdv';
  const origin = 'http://127.0.0.1:5176';
  const auth = authService({ byMatricula: async () => undefined, byId: async id => ({ id, matricula: 'F000' + id, podeCancelar: 0 }) as Employee }, secret, 300, true);
  const queries: string[] = [];
  const pool = {
    async execute(sql: string) { queries.push(sql); return [[]]; },
    async getConnection() { throw new Error('não deveria escrever'); },
  } as unknown as Pool;
  const server = createApp({ corsOrigin: origin, database: pool, official: true, admins: [], checkDatabase: async () => {},
    auth: { service: auth, ttl: 300, secure: false } }).listen(0, '127.0.0.1');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1/vendas';
  const cookie = auth.cookieName + '=' + jwt.sign({}, secret, { subject: '1', issuer: 'supermercado-qualidade-lider', audience: 'funcionario-oficial', expiresIn: 300 });
  const call = (path: string, method = 'GET', body?: object, headers: Record<string, string> = { Origin: origin, Cookie: cookie }) =>
    fetch(base + path, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  assert.equal((await call('', 'POST', {}, { Origin: origin })).status, 401);
  assert.equal((await call('/ativa', 'GET', undefined, {})).status, 401);
  assert.equal((await call('', 'POST', {}, { Cookie: cookie, Origin: 'https://externo.invalid' })).status, 403);
  assert.equal((await call('', 'POST', { id_sessao: 3 })).status, 400);
  assert.equal((await call('/1/itens', 'POST', { id_produto: 1, quantidade: '1', preco_unitario: '0.01' })).status, 400);
  assert.equal((await call('/1/itens', 'POST', { id_produto: 1, quantidade: '1', subtotal: '0.01' })).status, 400);
  for (const q of ['-1', '1.0001', '1e3', 1, '12345678']) assert.equal((await call('/1/itens', 'POST', { id_produto: 1, quantidade: q })).status, 400);
  assert.equal((await call('/1/itens', 'POST', { codigo_barras: "1' OR 1=1 --", quantidade: '1' })).status, 400);
  assert.equal((await call('/1/itens/2/cancelar', 'POST', { motivo: 'teste', id_supervisor: 2 })).status, 400);
  assert.equal((await call('/1/itens/2/cancelar', 'POST', { motivo: 'teste', supervisor: { id_funcionario: 2 } })).status, 400);
  assert.equal((await call('/1/cancelar', 'POST', {})).status, 400);
  assert.equal((await call('/1%20OR%201=1')).status, 400);
  assert.equal((await call('?status=ABERTA;DROP')).status, 400);
  assert.equal((await call('/1', 'DELETE')).status, 404);
  assert.equal((await call('/produtos?busca=a')).status, 400);
  assert.equal(queries.length, 0); // nada chegou ao banco
  assert.equal((await call('/ativa')).status, 200); // sem sessão aberta no fake
});

test('abertura repetida recupera a venda aberta existente (duplo clique, F5, reenvio)', async () => {
  const { state, service } = fakeDatabase();
  const first = await service.open(1);
  assert.equal(first.recuperada, false);
  await service.addItem(first.id_venda, 1, { id_produto: 1, quantidade: '2' });
  const again = await service.open(1); // ex.: botão clicado de novo após F5
  assert.equal(again.recuperada, true);
  assert.equal(again.id_venda, first.id_venda);
  assert.equal(again.itens.length, 1); // carrinho preservado
  assert.equal([...state.sales.values()].filter(s => s.id_sessao === 5).length, 1);
  assert.equal((await service.active(1)).venda?.id_venda, first.id_venda); // recuperação após atualizar a página
  await service.cancelSale(first.id_venda, 1);
  const next = await service.open(1); // sem venda aberta, cria uma nova
  assert.equal(next.recuperada, false);
  assert.notEqual(next.id_venda, first.id_venda);
});
