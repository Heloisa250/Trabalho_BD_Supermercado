import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import type { Employee } from '../src/modules/auth/repository.js';
import { authService } from '../src/modules/auth/service.js';
import { allocateFefo, planPayments, type LotRow, type PaymentForm } from '../src/modules/sales/checkout.js';
import { cents, milli, quantityText } from '../src/modules/sales/decimal.js';
import { fakeDatabase, rejects } from './helpers/sales-fake.js';

const forms: PaymentForm[] = [
  { id_forma_pagamento: 1, descricao: 'Dinheiro', permite_troco: 1, ativo: 1, dinheiro: 1 },
  { id_forma_pagamento: 3, descricao: 'Cartão de Crédito', permite_troco: 0, ativo: 1, dinheiro: 0 },
  { id_forma_pagamento: 4, descricao: 'Pix', permite_troco: 0, ativo: 1, dinheiro: 0 },
  { id_forma_pagamento: 6, descricao: 'Inativa', permite_troco: 1, ativo: 0, dinheiro: 0 },
  { id_forma_pagamento: 7, descricao: 'Vale com troco', permite_troco: 1, ativo: 1, dinheiro: 0 },
];
const total = cents('130.38');
function fails(run: () => unknown, code: string) {
  assert.throws(run, (error: { code?: string }) => { assert.equal(error.code, code); return true; });
}

test('pagamentos: dinheiro, troco, eletrônicos, misto e centavos', () => {
  assert.deepEqual(planPayments(total, forms, [{ id_forma_pagamento: 1, valor: '130.38', valor_recebido: '150.00' }]),
    [{ id_forma_pagamento: 1, valor: '130.38', valor_recebido: '150.00', troco: '19.62' }]);
  assert.equal(planPayments(total, forms, [{ id_forma_pagamento: 1, valor: '130.38' }])[0].troco, '0.00'); // dinheiro exato
  assert.deepEqual(planPayments(total, forms, [{ id_forma_pagamento: 4, valor: '130.38' }])[0],
    { id_forma_pagamento: 4, valor: '130.38', valor_recebido: '130.38', troco: '0.00' }); // Pix demonstrativo
  assert.equal(planPayments(total, forms, [{ id_forma_pagamento: 3, valor: '130.38', valor_recebido: '130.38' }])[0].troco, '0.00');
  const mixed = planPayments(total, forms, [{ id_forma_pagamento: 1, valor: '50.00', valor_recebido: '100.00' }, { id_forma_pagamento: 4, valor: '80.38' }]);
  assert.deepEqual(mixed.map(p => [p.valor, p.troco]), [['50.00', '50.00'], ['80.38', '0.00']]);
  for (const plan of mixed) assert.equal(cents(plan.valor_recebido) - cents(plan.troco), cents(plan.valor)); // recebido - troco = aplicado
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 1, valor: '130.38', valor_recebido: '130.37' }]), 'INSUFFICIENT_CASH');
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 4, valor: '130.37' }]), 'PAYMENT_INCOMPLETE'); // um centavo a menos
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 4, valor: '130.39' }]), 'PAYMENT_EXCEEDS_BALANCE'); // um centavo a mais
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 4, valor: '100.00' }, { id_forma_pagamento: 1, valor: '40.00' }]), 'PAYMENT_EXCEEDS_BALANCE');
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 4, valor: '0.00' }, { id_forma_pagamento: 1, valor: '130.38' }]), 'INVALID_PAYMENT');
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 6, valor: '130.38' }]), 'PAYMENT_FORM_INACTIVE');
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 99, valor: '130.38' }]), 'PAYMENT_FORM_NOT_FOUND');
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 4, valor: '130.38', valor_recebido: '140.00' }]), 'CHANGE_NOT_ALLOWED');
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 7, valor: '130.38', valor_recebido: '140.00' }]), 'CHANGE_NOT_ALLOWED'); // permite_troco sem ser dinheiro
  fails(() => planPayments(total, forms, [{ id_forma_pagamento: 4, valor: '30.38' }, { id_forma_pagamento: 4, valor: '100.00' }]), 'DUPLICATE_PAYMENT_FORM');
  fails(() => planPayments(0n, forms, [{ id_forma_pagamento: 4, valor: '0.01' }]), 'EMPTY_SALE');
  assert.equal(planPayments(cents('0.03'), forms, [{ id_forma_pagamento: 1, valor: '0.01' }, { id_forma_pagamento: 4, valor: '0.02' }]).length, 2);
});

const lot = (id_lote: number, id_produto: number, quantidade_atual: string, data_validade: string | null, data_entrada = '2026-10-01 08:00:00', vencido = 0): LotRow =>
  ({ id_lote, id_produto, quantidade_atual, data_validade, data_entrada, vencido });

test('FEFO: validade mais próxima, sem validade por último, desempates e lotes inelegíveis', () => {
  const lots = [
    lot(1, 1, '2.000', '2027-09-15'), lot(2, 1, '5.000', null), lot(3, 1, '1.000', '2027-01-10'),
    lot(4, 1, '9.000', '2026-11-01', '2026-10-01 08:00:00', 1), lot(5, 1, '0.000', '2026-12-01'),
    lot(6, 2, '1.125', '2026-12-10'), lot(7, 2, '1.600', null),
    lot(8, 3, '4.000', '2027-03-01', '2026-10-05 08:00:00'), lot(9, 3, '4.000', '2027-03-01', '2026-10-02 08:00:00'),
  ];
  const out = allocateFefo([
    { id_item_venda: 11, id_produto: 1, quantidade: '3.000', nome: 'Arroz' },
    { id_item_venda: 13, id_produto: 2, quantidade: '1.500', nome: 'Queijo KG' },
    { id_item_venda: 12, id_produto: 3, quantidade: '5.000', nome: 'Leite L' },
  ], lots);
  assert.deepEqual(out.map(o => [o.id_item_venda, o.id_lote, o.quantidade, o.saldo_final]), [
    [11, 3, '1.000', '0.000'], [11, 1, '2.000', '0.000'], // 2027-01 antes de 2027-09; vencido (4) e sem saldo (5) ignorados
    [12, 9, '4.000', '0.000'], [12, 8, '1.000', '3.000'], // mesma validade: entrada mais antiga primeiro
    [13, 6, '1.125', '0.000'], [13, 7, '0.375', '1.225'], // sem validade por último; decimal exato
  ]);
  for (const id of [11, 12, 13]) {
    const sum = out.filter(o => o.id_item_venda === id).reduce((s, o) => s + milli(o.quantidade), 0n);
    assert.equal(quantityText(sum), { 11: '3.000', 12: '5.000', 13: '1.500' }[id]);
  }
  fails(() => allocateFefo([{ id_item_venda: 1, id_produto: 1, quantidade: '8.001', nome: 'Arroz' }], lots), 'INSUFFICIENT_STOCK');
  fails(() => allocateFefo([{ id_item_venda: 1, id_produto: 1, quantidade: '1', nome: 'X' }], [lot(4, 1, '9.000', '2026-11-01', '2026-10-01 08:00:00', 1)]), 'INSUFFICIENT_STOCK');
  // duas linhas do mesmo produto consomem o saldo acumulado, sem reutilizar o que já saiu
  const twice = allocateFefo([{ id_item_venda: 1, id_produto: 2, quantidade: '1.000', nome: 'Q' }, { id_item_venda: 2, id_produto: 2, quantidade: '1.000', nome: 'Q' }], lots);
  assert.deepEqual(twice.map(o => [o.id_lote, o.quantidade]), [[6, '1.000'], [6, '0.125'], [7, '0.875']]);
});

// Monta, no banco em memória, uma venda equivalente à venda nº 6 (QA-S08): 3 itens ativos e 1 cancelado.
async function preparedSale() {
  const db = fakeDatabase();
  const { state, service } = db;
  state.products.get(6)!.disponivel = '2.725';
  state.products.set(2, { id_produto: 2, codigo_barras: '7891234500028', nome: 'Feijão', unidade_medida: 'UN', preco_venda: '8.49', ativo: 1, disponivel: '38.000', vencido: '0' });
  state.products.set(3, { id_produto: 3, codigo_barras: '7891234500035', nome: 'Refrigerante', unidade_medida: 'UN', preco_venda: '9.99', ativo: 1, disponivel: '197.000', vencido: '0' });
  for (const row of [lot(1, 1, '2.000', '2027-09-15', '2026-10-23 10:30:00'), lot(10, 1, '95.000', '2027-12-01'), lot(2, 2, '38.000', '2027-06-01'),
    lot(3, 3, '197.000', '2027-04-05'), lot(6, 6, '1.125', '2026-12-10'), lot(7, 6, '1.600', null)]) {
    state.lots.set(row.id_lote, { ...row, quantidade_inicial: row.quantidade_atual });
  }
  const { id_venda } = await service.open(1);
  await service.addItem(id_venda, 1, { id_produto: 1, quantidade: '3' });
  await service.addItem(id_venda, 1, { id_produto: 3, quantidade: '2' });
  await service.addItem(id_venda, 1, { id_produto: 6, quantidade: '1.125' });
  const view = await service.addItem(id_venda, 1, { id_produto: 2, quantidade: '1' });
  await service.cancelItem(id_venda, view.itens[3].id_item_venda, 1, { motivo: 'Cliente desistiu', supervisor: { matricula: 'F0002', senha: 'senha-correta-2' } });
  return { ...db, sale: id_venda, cancelled: view.itens[3].id_item_venda };
}
const cash = { pagamentos: [{ id_forma_pagamento: 1, valor: '130.38', valor_recebido: '150.00' }] };

test('finalização: pagamentos, baixa FEFO, SAIDA_VENDA, item cancelado ignorado e status', async () => {
  const { state, service, sale, cancelled } = await preparedSale();
  const summary = await service.paymentSummary(sale, 1);
  assert.equal(summary.valor_total, '130.38');
  assert.equal(summary.saldo, '130.38');
  assert.equal(summary.itens_ativos.length, 3);
  assert.deepEqual(summary.formas.map(f => [f.descricao, f.permite_troco]), [['Dinheiro', true], ['Cartão de Débito', false], ['Cartão de Crédito', false], ['Pix', false], ['Vale com troco', false]]);
  await rejects(service.receipt(sale, 1), 409, 'SALE_NOT_FINALIZED');
  const done = await service.finalize(sale, 1, cash);
  assert.equal(done.status, 'FINALIZADA');
  assert.equal(done.aviso, 'COMPROVANTE DEMONSTRATIVO — SEM VALOR FISCAL');
  assert.deepEqual([done.total_pago, done.total_recebido, done.troco], ['130.38', '150.00', '19.62']);
  assert.equal(state.sales.get(sale)!.status, 'FINALIZADA');
  assert.deepEqual([...state.paymentRows.values()], [{ id_venda: sale, id_forma_pagamento: 1, valor: '130.38', valor_recebido: '150.00', troco: '19.62' }]);
  // Arroz consome 2 do lote 1 (validade mais próxima) e 1 do lote 10; queijo KG consome o lote com validade antes do sem validade
  assert.deepEqual([...state.movementRows.values()].map(m => [m.id_lote, m.quantidade]), [['1', '2.000'], ['10', '1.000'], ['3', '2.000'], ['6', '1.125']].map(([l, q]) => [Number(l), q]));
  assert.ok(![...state.movementRows.values()].some(m => m.id_item_venda === cancelled)); // item cancelado sem baixa
  assert.equal(state.lots.get(1)!.quantidade_atual, '0.000');
  assert.equal(state.lots.get(10)!.quantidade_atual, '94.000');
  assert.equal(state.lots.get(7)!.quantidade_atual, '1.600');
  assert.equal(state.lots.get(2)!.quantidade_atual, '38.000'); // feijão cancelado intocado
  assert.equal(state.lots.get(1)!.quantidade_inicial, '2.000'); // quantidade_inicial preservada
  assert.equal((await service.receipt(sale, 1)).itens.find(i => i.id_item_venda === cancelled)?.situacao, 'CANCELADO');
  // repetição (inclusive após F5): rejeitada sem novos pagamentos, movimentações ou baixa
  const counts = [state.paymentRows.size, state.movementRows.size, state.lots.get(10)!.quantidade_atual];
  await rejects(service.finalize(sale, 1, cash), 409, 'SALE_NOT_OPEN');
  assert.deepEqual([state.paymentRows.size, state.movementRows.size, state.lots.get(10)!.quantidade_atual], counts);
  // pós-finalização: itens bloqueados
  await rejects(service.addItem(sale, 1, { id_produto: 1, quantidade: '1' }), 409, 'SALE_NOT_OPEN');
  await rejects(service.updateItem(sale, 11, 1, '1'), 409, 'SALE_NOT_OPEN');
  await rejects(service.cancelSale(sale, 1), 409, 'SALE_NOT_OPEN');
  assert.equal(state.sessions.get(5)!.data_fechamento, null); // sessão continua aberta
});

test('finalização: concorrência, rollback em cada etapa e validações de venda', async () => {
  {
    const { state, service, sale } = await preparedSale();
    const results = await Promise.allSettled([service.finalize(sale, 1, cash), service.finalize(sale, 1, cash), service.finalize(sale, 1, cash)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(state.paymentRows.size, 1);
    assert.equal(state.movementRows.size, 4);
  }
  for (const point of ['pagamento', 'lote', 'movimentacao', 'status']) {
    const { state, service, sale } = await preparedSale();
    const before = JSON.stringify([...state.lots.values()]);
    state.failOn = point;
    await assert.rejects(service.finalize(sale, 1, cash));
    assert.equal(state.sales.get(sale)!.status, 'ABERTA', point);
    assert.equal(state.paymentRows.size, 0, point);
    assert.equal(state.movementRows.size, 0, point);
    assert.equal(JSON.stringify([...state.lots.values()]), before, point);
    assert.equal((await service.finalize(sale, 1, cash)).status, 'FINALIZADA', point); // nova tentativa consulta estado real
  }
  {
    const { state, service, sale } = await preparedSale();
    await rejects(service.finalize(999, 1, cash), 404);
    await rejects(service.finalize(sale, 3, cash), 403); // operador diferente
    await rejects(service.finalize(5, 1, cash), 403); // venda de outra sessão (histórica nº 5)
    await rejects(service.finalize(sale, 1, { pagamentos: [{ id_forma_pagamento: 4, valor: '100.00' }] }), 409, 'PAYMENT_INCOMPLETE');
    state.sales.get(sale)!.valor_total = '130.39';
    await rejects(service.finalize(sale, 1, cash), 409, 'TOTAL_MISMATCH');
    state.sales.get(sale)!.valor_total = '130.38';
    state.lots.get(10)!.quantidade_atual = '0.500'; // perda/ajuste concorrente já aplicado antes do lock
    await rejects(service.finalize(sale, 1, cash), 409, 'INSUFFICIENT_STOCK');
    state.lots.get(10)!.quantidade_atual = '95.000';
    state.products.get(3)!.ativo = 0;
    await rejects(service.finalize(sale, 1, cash), 409, 'INACTIVE_PRODUCT');
    state.products.get(3)!.ativo = 1;
    state.sessions.get(5)!.data_fechamento = '2026-11-10 18:00:00';
    await rejects(service.finalize(sale, 1, cash), 409, 'SESSION_CLOSED');
    state.sessions.get(5)!.data_fechamento = null;
    state.sales.get(sale)!.status = 'CANCELADA';
    await rejects(service.finalize(sale, 1, cash), 409, 'SALE_NOT_OPEN');
    assert.equal(state.paymentRows.size + state.movementRows.size, 0);
  }
  {
    const { service } = fakeDatabase();
    const { id_venda } = await service.open(1);
    await rejects(service.finalize(id_venda, 1, cash), 409, 'EMPTY_SALE'); // venda sem itens
  }
});

test('rotas de finalização: CSRF, autenticação e contrato estrito', async context => {
  const secret = 'segredo-isolado-apenas-para-teste-de-checkout';
  const origin = 'http://127.0.0.1:5176';
  const auth = authService({ byMatricula: async () => undefined, byId: async id => ({ id, matricula: 'F000' + id, podeCancelar: 0 }) as Employee }, secret, 300, true);
  const queries: string[] = [];
  const pool = { async execute(sql: string) { queries.push(sql); return [[]]; }, async getConnection() { throw new Error('não deveria escrever'); } } as unknown as Pool;
  const server = createApp({ corsOrigin: origin, database: pool, official: true, admins: [], checkDatabase: async () => {}, auth: { service: auth, ttl: 300, secure: false } }).listen(0, '127.0.0.1');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1/vendas/6';
  const cookie = auth.cookieName + '=' + jwt.sign({}, secret, { subject: '1', issuer: 'supermercado-qualidade-lider', audience: 'funcionario-oficial', expiresIn: 300 });
  const post = (body: object, headers: Record<string, string> = { Origin: origin, Cookie: cookie }) =>
    fetch(base + '/finalizar', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ok = { id_forma_pagamento: 1, valor: '130.38', valor_recebido: '150.00' };
  assert.equal((await post({ pagamentos: [ok] }, { Origin: origin })).status, 401);
  assert.equal((await post({ pagamentos: [ok] }, { Cookie: cookie, Origin: 'https://externo.invalid' })).status, 403);
  for (const body of [{ pagamentos: [] }, { pagamentos: [ok], status: 'FINALIZADA' }, { pagamentos: [ok], valor_total: '1.00' },
    { pagamentos: [{ ...ok, troco: '0.00' }] }, { pagamentos: [{ ...ok, id_lote: 1 }] }, { pagamentos: [ok], id_operador: 2 },
    { pagamentos: [{ ...ok, valor: '-1.00' }] }, { pagamentos: [{ ...ok, valor: 130.38 }] }, { pagamentos: [{ ...ok, valor: '1.001' }] },
    { pagamentos: [{ ...ok, numero_cartao: '4111111111111111' }] }]) {
    assert.equal((await post(body)).status, 400, JSON.stringify(body));
  }
  assert.equal(queries.length, 0);
  assert.equal((await fetch(base + '/comprovante')).status, 401);
  assert.equal((await fetch(base + '/pagamento/resumo')).status, 401);
});
