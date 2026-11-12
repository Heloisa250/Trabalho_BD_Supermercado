import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { parse } from '../admin/controller.js';
import { AdminError } from '../admin/error.js';
import { cashConference } from '../cash/conference.js';
import { cents, milli, moneyText, quantityText } from '../sales/decimal.js';
import { addDays, averageTicket, fillSeries, localToday, period, sumMoney } from './period.js';
import { dashboardRepository, type DashboardRepository } from './repository.js';

const ref = z.coerce.number().int().min(1).max(2147483647).optional();
const day = z.iso.date().refine(value => value >= '2000-01-01' && value <= '2100-12-31').optional();
const base = { inicio: day, fim: day };
const schemas = {
  resumo: z.object({ ...base, dias: z.coerce.number().int().min(0).max(365).default(30) }).strict(),
  serie: z.object({ ...base, agrupamento: z.enum(['dia', 'semana', 'mes']).default('dia') }).strict(),
  produtos: z.object({ ...base, categoria: ref, produto: ref, limite: z.coerce.number().int().min(1).max(50).default(10) }).strict(),
  pagamentos: z.object({ ...base }).strict(),
  estoque: z.object({ categoria: ref, dias: z.coerce.number().int().min(0).max(365).default(30),
    situacao: z.enum(['BAIXO', 'ACIMA', 'NORMAL']).optional() }).strict(),
  movimentacoes: z.object({ ...base, produto: ref, lote: ref, tipo: z.enum(['ENTRADA', 'SAIDA_VENDA', 'PERDA', 'AJUSTE']).optional(),
    pagina: z.coerce.number().int().min(1).max(100000).default(1) }).strict(),
  compras: z.object({ ...base, fornecedor: ref }).strict(),
  fornecedores: z.object({ ...base, fornecedor: ref }).strict(),
  caixas: z.object({ ...base, operador: ref }).strict(),
};

const statuses = ['ABERTA', 'FINALIZADA', 'CANCELADA'] as const;
const orderStatuses = ['PENDENTE', 'ENVIADO', 'RECEBIDO', 'CANCELADO'] as const;
const money = (value: string | number | null) => moneyText(cents(String(value ?? '0')));
const qty = (value: string | number | null) => quantityText(milli(String(value ?? '0')));

export function stockSituation(physical: string, minimum: string, maximum: string) {
  const amount = milli(physical);
  return amount < milli(minimum) ? 'BAIXO' as const : amount > milli(maximum) ? 'ACIMA' as const : 'NORMAL' as const;
}

// Indicadores gerenciais (Script 10): somente leitura, apenas para administradores autorizados.
export function dashboardService(repo: DashboardRepository, now: () => number = Date.now) {
  return {
    async resumo(q: z.infer<typeof schemas.resumo>) {
      const range = period(q.inicio, q.fim, now());
      const today = localToday(now());
      const [byStatus, openNow, orders, sessions, stock, lots] = await Promise.all([
        repo.salesByStatus(range), repo.openSalesNow(), repo.ordersByStatusNow(), repo.openSessionsNow(),
        repo.stockByProduct(today, null), repo.lotAlerts(today, addDays(today, q.dias))]);
      const status = Object.fromEntries(statuses.map(name => {
        const row = byStatus.find(item => item.status === name);
        return [name, { vendas: Number(row?.vendas ?? 0), valor: money(row?.valor ?? '0') }];
      })) as Record<typeof statuses[number], { vendas: number; valor: string }>;
      const finalized = status.FINALIZADA;
      return { periodo: range, faturamento: finalized.valor, vendas_finalizadas: finalized.vendas,
        ticket_medio: averageTicket(finalized.valor, finalized.vendas),
        vendas_por_status: status, vendas_abertas_agora: Number(openNow),
        pedidos_por_status: Object.fromEntries(orderStatuses.map(name => [name, Number(orders.find(row => row.status === name)?.pedidos ?? 0)])),
        produtos_estoque_baixo: stock.filter(row => row.ativo === 1 && stockSituation(String(row.fisico), row.estoque_minimo, row.estoque_maximo) === 'BAIXO').length,
        lotes_proximos_vencimento: lots.filter(row => row.situacao === 'PROXIMO').length, horizonte_dias: q.dias,
        caixas_abertos: Number(sessions) };
    },
    async serie(q: z.infer<typeof schemas.serie>) {
      const range = period(q.inicio, q.fim, now());
      return { periodo: range, agrupamento: q.agrupamento, pontos: fillSeries(await repo.revenueSeries(range, q.agrupamento), range.inicio, range.fim, q.agrupamento) };
    },
    async produtos(q: z.infer<typeof schemas.produtos>) {
      const range = period(q.inicio, q.fim, now());
      const filter = { categoria: q.categoria ?? null, produto: q.produto ?? null };
      const [ranking, units] = await Promise.all([repo.topProducts(range, { ...filter, limite: q.limite }), repo.quantitiesByUnit(range, filter)]);
      return { periodo: range,
        ranking: ranking.map((row, index) => ({ posicao: index + 1, ...row, quantidade: qty(row.quantidade), receita: money(row.receita), vendas: Number(row.vendas) })),
        por_unidade: units.map(row => ({ unidade_medida: row.unidade_medida, quantidade: qty(row.quantidade), receita: money(row.receita), produtos: Number(row.produtos) })) };
    },
    async pagamentos(q: z.infer<typeof schemas.pagamentos>) {
      const range = period(q.inicio, q.fim, now());
      const [forms, byStatus, multi] = await Promise.all([repo.paymentsByForm(range), repo.salesByStatus(range), repo.multiPaymentSales(range)]);
      const formas = forms.map(row => ({ ...row, dinheiro: row.dinheiro === 1, pagamentos: Number(row.pagamentos), vendas: Number(row.vendas),
        aplicado: money(row.aplicado), recebido: money(row.recebido), troco: money(row.troco) }));
      const revenue = money(byStatus.find(row => row.status === 'FINALIZADA')?.valor ?? '0');
      const applied = sumMoney(formas.map(row => row.aplicado));
      const cash = formas.filter(row => row.dinheiro);
      return { periodo: range, formas,
        dinheiro_fisico: { recebido: sumMoney(cash.map(row => row.recebido)), troco: sumMoney(cash.map(row => row.troco)), aplicado: sumMoney(cash.map(row => row.aplicado)) },
        vendas_com_pagamento_multiplo: Number(multi),
        // Conferência: o faturamento vem das vendas; a soma aplicada dos pagamentos deve ser igual, não somada a ele.
        conciliacao: { faturamento_vendas: revenue, total_aplicado: applied, diferenca: moneyText(cents(applied) - cents(revenue)) } };
    },
    async estoque(q: z.infer<typeof schemas.estoque>) {
      const today = localToday(now());
      const [stock, lots] = await Promise.all([repo.stockByProduct(today, q.categoria ?? null), repo.lotAlerts(today, addDays(today, q.dias))]);
      const produtos = stock.map(row => ({ ...row, fisico: qty(row.fisico), disponivel: qty(row.disponivel), vencido: qty(row.vencido),
        estoque_minimo: qty(row.estoque_minimo), estoque_maximo: qty(row.estoque_maximo), lotes: Number(row.lotes), ativo: row.ativo === 1,
        situacao: stockSituation(String(row.fisico), row.estoque_minimo, row.estoque_maximo) }));
      const lotes = lots.map(row => ({ ...row, quantidade_atual: qty(row.quantidade_atual) }));
      const count = (name: string) => lotes.filter(row => row.situacao === name).length;
      return { hoje: today, horizonte_dias: q.dias,
        totais: { abaixo_minimo: produtos.filter(row => row.situacao === 'BAIXO').length, acima_maximo: produtos.filter(row => row.situacao === 'ACIMA').length,
          sem_lotes: produtos.filter(row => row.lotes === 0).length, lotes_vencidos: count('VENCIDO'), lotes_proximos: count('PROXIMO'), lotes_sem_validade: count('SEM_VALIDADE') },
        produtos: q.situacao ? produtos.filter(row => row.situacao === q.situacao) : produtos, lotes };
    },
    async movimentacoes(q: z.infer<typeof schemas.movimentacoes>) {
      const range = period(q.inicio, q.fim, now());
      const filter = { produto: q.produto ?? null, lote: q.lote ?? null, tipo: q.tipo ?? null };
      const [items, totals] = await Promise.all([repo.movements(range, filter, q.pagina, 20), repo.movementTotals(range, filter)]);
      return { periodo: range, pagina: q.pagina, mais: items.length > 20, items: items.slice(0, 20).map(row => ({ ...row, quantidade: qty(row.quantidade) })),
        totais: totals.map(row => ({ ...row, movimentacoes: Number(row.movimentacoes), quantidade: qty(row.quantidade), positivo: qty(row.positivo), negativo: qty(row.negativo) })) };
    },
    async compras(q: z.infer<typeof schemas.compras>) {
      const range = period(q.inicio, q.fim, now());
      const today = localToday(now());
      const [byStatus, waiting] = await Promise.all([repo.ordersByStatus(range, q.fornecedor ?? null), repo.awaitingReceipt(q.fornecedor ?? null)]);
      const status = Object.fromEntries(orderStatuses.map(name => {
        const row = byStatus.find(item => item.status === name);
        return [name, { pedidos: Number(row?.pedidos ?? 0), valor: money(row?.valor ?? '0') }];
      }));
      return { periodo: range, por_status: status, total_pedidos: byStatus.reduce((sum, row) => sum + Number(row.pedidos), 0),
        // Valor estimado = custos históricos dos itens; pedidos cancelados ficam fora do total.
        valor_estimado: sumMoney(byStatus.filter(row => row.status !== 'CANCELADO').map(row => money(row.valor))),
        aguardando_recebimento: waiting.map(row => ({ ...row, valor: money(row.valor), itens: Number(row.itens),
          atrasado: row.status === 'ENVIADO' && row.data_prevista !== null && String(row.data_prevista).slice(0, 10) < today })) };
    },
    async fornecedores(q: z.infer<typeof schemas.fornecedores>) {
      const range = period(q.inicio, q.fim, now());
      return { periodo: range, items: (await repo.suppliers(range, q.fornecedor ?? null)).map(row => ({ ...row, ativo: row.ativo === 1,
        ...Object.fromEntries(['pedidos', 'pendentes', 'enviados', 'recebidos', 'cancelados', 'produtos_fornecidos', 'recebidos_com_prazo', 'recebidos_com_atraso']
          .map(key => [key, Number(row[key as keyof typeof row])])),
        valor_total: money(row.valor_total), valor_recebido: money(row.valor_recebido) })) };
    },
    async caixas(q: z.infer<typeof schemas.caixas>) {
      const range = period(q.inicio, q.fim, now());
      const [sessions, operators] = await Promise.all([repo.sessions(range, q.operador ?? null), repo.operators(range, q.operador ?? null)]);
      const payments = await repo.sessionPayments(sessions.map(row => row.id_sessao));
      const sessoes = sessions.map(row => {
        const conference = cashConference(row.fundo_troco, row.valor_contado, payments.filter(payment => payment.id_sessao === row.id_sessao));
        return { ...row, situacao: row.data_fechamento === null ? 'ABERTA' : 'FECHADA', ...conference };
      });
      return { periodo: range, abertas: sessoes.filter(row => row.situacao === 'ABERTA').length, fechadas: sessoes.filter(row => row.situacao === 'FECHADA').length,
        sessoes, operadores: operators.map(row => ({ ...row, sessoes: Number(row.sessoes), vendas_finalizadas: Number(row.vendas_finalizadas), faturamento: money(row.faturamento) })) };
    },
  };
}

export function dashboardRoutes(pool: Pool | undefined, academic = false) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const service = () => {
    if (!pool) throw new AdminError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    return dashboardService(dashboardRepository(pool, academic));
  };
  router.get('/resumo', async (req, res) => { res.json(await service().resumo(parse(schemas.resumo, req.query))); });
  router.get('/vendas/serie', async (req, res) => { res.json(await service().serie(parse(schemas.serie, req.query))); });
  router.get('/vendas/produtos', async (req, res) => { res.json(await service().produtos(parse(schemas.produtos, req.query))); });
  router.get('/vendas/pagamentos', async (req, res) => { res.json(await service().pagamentos(parse(schemas.pagamentos, req.query))); });
  router.get('/estoque/alertas', async (req, res) => { res.json(await service().estoque(parse(schemas.estoque, req.query))); });
  router.get('/estoque/movimentacoes', async (req, res) => { res.json(await service().movimentacoes(parse(schemas.movimentacoes, req.query))); });
  router.get('/compras/resumo', async (req, res) => { res.json(await service().compras(parse(schemas.compras, req.query))); });
  router.get('/fornecedores', async (req, res) => { res.json(await service().fornecedores(parse(schemas.fornecedores, req.query))); });
  router.get('/caixas/resumo', async (req, res) => { res.json(await service().caixas(parse(schemas.caixas, req.query))); });
  return router;
}
