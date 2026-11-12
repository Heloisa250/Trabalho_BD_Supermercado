import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import type { Employee } from '../src/modules/auth/repository.js';
import { authService } from '../src/modules/auth/service.js';
import { averageTicket, bucketOf, fillSeries, localToday, period } from '../src/modules/dashboard/period.js';
import type { DashboardRepository } from '../src/modules/dashboard/repository.js';
import { dashboardService, stockSituation } from '../src/modules/dashboard/routes.js';

const NOW = Date.parse('2026-11-10T13:50:00Z'); // 10:50 em Brasília

test('período: datas locais inclusivas viram intervalo UTC semiaberto sem trocar o dia', () => {
  assert.deepEqual(period('2026-11-10', '2026-11-10', NOW), { inicio: '2026-11-10', fim: '2026-11-10', dias: 1,
    desde: '2026-11-10 03:00:00', ate: '2026-11-11 03:00:00' });
  // venda às 01:30 UTC de 11/11 = 22:30 de 10/11 em Brasília → pertence ao dia 10
  const range = period('2026-11-10', '2026-11-10', NOW);
  assert.ok('2026-11-11 01:30:00' >= range.desde && '2026-11-11 01:30:00' < range.ate);
  assert.ok(!('2026-11-10 02:59:59' >= range.desde)); // 23:59 do dia 9 fica fora
  assert.equal(period(undefined, undefined, NOW).inicio, '2026-10-12'); // padrão: últimos 30 dias
  assert.equal(localToday(Date.parse('2026-11-11T02:00:00Z')), '2026-11-10');
  assert.throws(() => period('2026-11-11', '2026-11-10', NOW), /anterior/);
  assert.throws(() => period('2024-01-01', '2026-01-01', NOW), /máximo/);
});

test('séries: semana começa na segunda, mês no dia 1, buracos marcados como sem registro', () => {
  assert.equal(bucketOf('2026-11-10', 'semana'), '2026-11-09');
  assert.equal(bucketOf('2026-11-08', 'semana'), '2026-11-02');
  assert.equal(bucketOf('2026-11-30', 'mes'), '2026-11-01');
  const days = fillSeries([{ periodo: '2026-11-03', vendas: 2, faturamento: '62.99' }], '2026-11-02', '2026-11-04', 'dia');
  assert.deepEqual(days, [
    { periodo: '2026-11-02', vendas: 0, faturamento: '0.00', sem_registro: true },
    { periodo: '2026-11-03', vendas: 2, faturamento: '62.99', sem_registro: false },
    { periodo: '2026-11-04', vendas: 0, faturamento: '0.00', sem_registro: true }]);
  assert.deepEqual(fillSeries([], '2026-10-15', '2027-01-02', 'mes').map(p => p.periodo), ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01']);
  assert.equal(fillSeries([], '2026-11-01', '2026-11-30', 'semana').length, 6);
});

test('ticket médio e situação de estoque', () => {
  assert.equal(averageTicket('0.00', 0), null); // sem divisão por zero
  assert.equal(averageTicket('130.38', 1), '130.38');
  assert.equal(averageTicket('10.00', 3), '3.33');
  assert.equal(averageTicket('0.05', 2), '0.03'); // 0,025 → meio para cima
  assert.equal(stockSituation('0', '10.000', '100.000'), 'BAIXO'); // produto sem lotes
  assert.equal(stockSituation('9.999', '10.000', '100.000'), 'BAIXO');
  assert.equal(stockSituation('10.000', '10.000', '100.000'), 'NORMAL'); // igual ao mínimo não é baixo
  assert.equal(stockSituation('100.001', '10.000', '100.000'), 'ACIMA');
});

// Repositório em memória: verifica a montagem das respostas (as consultas SQL são verificadas em MySQL real).
function fakeRepo(): DashboardRepository {
  const no = async () => [];
  return {
    salesByStatus: async () => [{ status: 'FINALIZADA', vendas: 4, valor: '281.14' }, { status: 'ABERTA', vendas: 1, valor: '38.89' }, { status: 'CANCELADA', vendas: 1, valor: '19.56' }],
    openSalesNow: async () => 1, ordersByStatusNow: async () => [{ status: 'RECEBIDO', pedidos: 5 }, { status: 'ENVIADO', pedidos: 1 }], openSessionsNow: async () => 2,
    revenueSeries: no, topProducts: no, quantitiesByUnit: no, multiPaymentSales: async () => 1,
    paymentsByForm: async () => [
      { id_forma_pagamento: 1, descricao: 'Dinheiro', dinheiro: 1, pagamentos: 3, vendas: 3, aplicado: '193.14', recebido: '220.00', troco: '25.97' },
      { id_forma_pagamento: 3, descricao: 'Cartão de Crédito', dinheiro: 0, pagamentos: 1, vendas: 1, aplicado: '70.00', recebido: '70.00', troco: '0.00' },
      { id_forma_pagamento: 4, descricao: 'Pix', dinheiro: 0, pagamentos: 1, vendas: 1, aplicado: '18.00', recebido: '18.00', troco: '0.00' }],
    stockByProduct: async () => [
      { id_produto: 1, nome: 'A', codigo_barras: '1', categoria: 'X', unidade_medida: 'UN', ativo: 1, estoque_minimo: '10.000', estoque_maximo: '50.000', fisico: '94.000', disponivel: '94.000', vencido: '0', lotes: 1 },
      { id_produto: 2, nome: 'B', codigo_barras: '2', categoria: 'X', unidade_medida: 'KG', ativo: 1, estoque_minimo: '5.000', estoque_maximo: '50.000', fisico: '0', disponivel: '0', vencido: '0', lotes: 0 },
      { id_produto: 3, nome: 'C', codigo_barras: '3', categoria: 'X', unidade_medida: 'L', ativo: 0, estoque_minimo: '5.000', estoque_maximo: '50.000', fisico: '1.000', disponivel: '0', vencido: '0', lotes: 1 }],
    lotAlerts: async () => [{ id_lote: 5, codigo_lote: 'L5', id_produto: 5, produto: 'Banana', unidade_medida: 'KG', data_validade: '2026-11-09', quantidade_atual: '48.750', situacao: 'VENCIDO' },
      { id_lote: 6, codigo_lote: 'L6', id_produto: 6, produto: 'Q', unidade_medida: 'KG', data_validade: '2026-12-01', quantidade_atual: '1.000', situacao: 'PROXIMO' },
      { id_lote: 7, codigo_lote: 'L7', id_produto: 6, produto: 'Q', unidade_medida: 'KG', data_validade: null, quantidade_atual: '1.600', situacao: 'SEM_VALIDADE' }],
    movements: no, movementTotals: no, ordersByStatus: no, awaitingReceipt: no, suppliers: no,
    sessions: async () => [{ id_sessao: 5, numero: 2, id_operador: 1, operador: 'Op', matricula: 'F0001', data_abertura: '2026-11-10 12:57:16', data_fechamento: null, fundo_troco: '200.00', valor_contado: null },
      { id_sessao: 2, numero: 2, id_operador: 4, operador: 'Op4', matricula: 'F0004', data_abertura: '2026-11-04 08:00:00', data_fechamento: '2026-11-04 14:00:00', fundo_troco: '150.00', valor_contado: '167.77' }],
    sessionPayments: async () => [
      { id_sessao: 5, id_venda: 6, status: 'FINALIZADA', valor_total: '130.38', id_pagamento: 5, valor: '130.38', valor_recebido: '150.00', troco: '19.62', dinheiro: 1 },
      { id_sessao: 5, id_venda: 8, status: 'ABERTA', valor_total: '50.00', id_pagamento: null, valor: null, valor_recebido: null, troco: null, dinheiro: null },
      { id_sessao: 2, id_venda: 3, status: 'FINALIZADA', valor_total: '87.77', id_pagamento: 3, valor: '17.77', valor_recebido: '20.00', troco: '2.23', dinheiro: 1 },
      { id_sessao: 2, id_venda: 3, status: 'FINALIZADA', valor_total: '87.77', id_pagamento: 4, valor: '70.00', valor_recebido: '70.00', troco: '0.00', dinheiro: 0 },
      { id_sessao: 2, id_venda: 4, status: 'CANCELADA', valor_total: '19.56', id_pagamento: null, valor: null, valor_recebido: null, troco: null, dinheiro: null }],
    operators: no,
  } as DashboardRepository;
}

test('montagem: faturamento só de FINALIZADA, pagamentos sem duplicar receita e conferência do Script 07', async () => {
  const service = dashboardService(fakeRepo(), () => NOW);
  const resumo = await service.resumo({ dias: 30 });
  assert.equal(resumo.faturamento, '281.14');
  assert.equal(resumo.vendas_finalizadas, 4);
  assert.equal(resumo.ticket_medio, '70.29'); // 70,285 → 70,29
  assert.equal(resumo.vendas_por_status.CANCELADA.valor, '19.56'); // exibido à parte, fora do faturamento
  assert.equal(resumo.produtos_estoque_baixo, 1); // B (sem lotes) conta; C é inativo e não entra no card
  assert.equal(resumo.lotes_proximos_vencimento, 1);
  assert.equal(resumo.caixas_abertos, 2);
  assert.deepEqual(resumo.pedidos_por_status, { PENDENTE: 0, ENVIADO: 1, RECEBIDO: 5, CANCELADO: 0 });
  const pagamentos = await service.pagamentos({});
  assert.deepEqual(pagamentos.dinheiro_fisico, { recebido: '220.00', troco: '25.97', aplicado: '193.14' });
  assert.deepEqual(pagamentos.conciliacao, { faturamento_vendas: '281.14', total_aplicado: '281.14', diferenca: '0.00' });
  const estoque = await service.estoque({ dias: 30 });
  assert.deepEqual(estoque.totais, { abaixo_minimo: 2, acima_maximo: 1, sem_lotes: 1, lotes_vencidos: 1, lotes_proximos: 1, lotes_sem_validade: 1 });
  assert.equal(estoque.produtos.find(p => p.id_produto === 2)?.fisico, '0.000');
  const caixas = await service.caixas({});
  const open = caixas.sessoes.find(s => s.id_sessao === 5)!;
  assert.equal(open.situacao, 'ABERTA');
  assert.equal(open.recebido_dinheiro, '130.38'); // aplicado em dinheiro, não os 150,00 recebidos
  assert.equal(open.valor_esperado, '330.38');
  assert.equal(open.vendas_abertas, 1); // venda ABERTA não entra como dinheiro
  const closed = caixas.sessoes.find(s => s.id_sessao === 2)!;
  assert.deepEqual([closed.valor_esperado, closed.diferenca, closed.resultado], ['167.77', '0.00', 'CONFERIDO']);
  assert.deepEqual([caixas.abertas, caixas.fechadas], [1, 1]);
});

test('rotas do dashboard: autenticação, perfil administrativo, filtros e campos sensíveis', async context => {
  const secret = 'segredo-isolado-apenas-para-teste-de-dashboard';
  const origin = 'http://127.0.0.1:5176';
  const auth = authService({ byMatricula: async () => undefined, byId: async id => ({ id, matricula: id === 1 ? 'F0001' : 'F0003', podeCancelar: 1 }) as Employee }, secret, 300, true);
  const sql: string[] = [];
  const pool = { async execute(text: string) { sql.push(text); return [text.includes('COUNT(*) AS n') ? [{ n: 0 }] : []]; },
    async getConnection() { throw new Error('dashboard não abre transações'); } } as unknown as Pool;
  const server = createApp({ corsOrigin: origin, database: pool, official: true, admins: ['F0001'], checkDatabase: async () => {}, auth: { service: auth, ttl: 300, secure: false } }).listen(0, '127.0.0.1');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1/dashboard';
  const cookie = (id: number) => auth.cookieName + '=' + jwt.sign({}, secret, { subject: String(id), issuer: 'supermercado-qualidade-lider', audience: 'funcionario-oficial', expiresIn: 300 });
  const get = (path: string, id = 1) => fetch(base + path, { headers: id ? { Cookie: cookie(id) } : {} });
  const paths = ['/resumo', '/vendas/serie', '/vendas/produtos', '/vendas/pagamentos', '/estoque/alertas', '/estoque/movimentacoes', '/compras/resumo', '/fornecedores', '/caixas/resumo'];
  for (const path of paths) {
    assert.equal((await get(path, 0)).status, 401, path);
    assert.equal((await get(path, 3)).status, 403, path); // F0003 pode cancelar itens, mas não é administrador
  }
  assert.equal(sql.length, 0);
  for (const query of ['?inicio=2026-13-01', '?inicio=2026-11-10&fim=2026-11-01', '?inicio=2020-01-01&fim=2026-01-01', "?inicio=2026-11-01' OR 1=1 --",
    '?agrupamento=ano', '?ordem=valor_total;DROP', '?limite=1000', '?categoria=1%20OR%201=1', '?tipo=VENDA']) {
    const path = query.includes('agrupamento') ? '/vendas/serie' : query.includes('limite') || query.includes('categoria') ? '/vendas/produtos' : query.includes('tipo') ? '/estoque/movimentacoes' : '/resumo';
    assert.equal((await get(path + query)).status, 400, path + query);
  }
  assert.equal(sql.length, 0); // nada inválido chega ao banco
  for (const path of paths) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(await response.text(), /cpf|senha|salario/i, path);
  }
  assert.ok(sql.every(text => /^\s*SELECT/i.test(text)), 'somente SELECT');
  assert.ok(sql.every(text => !/cpf|senha_hash|salario/i.test(text)), 'sem colunas sensíveis');
  assert.equal((await fetch(base + '/resumo', { method: 'POST', headers: { Cookie: cookie(1), Origin: origin } })).status, 404);
});
