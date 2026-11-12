import type { Pool, RowDataPacket } from 'mysql2/promise';
import { CASH_FORM_SQL } from '../cash/conference.js';
import { bucketSql, PRESENTATION_OFFSET_HOURS, type Grouping } from './period.js';

type Arg = string | number | null;
export type Range = { desde: string; ate: string };
const localDate = (column: string) => `DATE(DATE_ADD(${column}, INTERVAL ${PRESENTATION_OFFSET_HOURS} HOUR))`;
// Subtotal do item de venda: o valor persistido; se NULL (dado legado), quantidade × preço registrado.
const saleLine = 'COALESCE(i.subtotal, ROUND(i.quantidade * i.preco_unitario, 2))';
// Mesmo arredondamento por item usado pelo módulo de compras (Script 05).
const purchaseLine = 'ROUND(i.quantidade * i.custo_unitario, 2)';
const notCancelled = 'NOT EXISTS (SELECT 1 FROM cancelamento_item ci WHERE ci.id_item_venda = i.id_item_venda)';

// Somente SELECT. Cada consulta agrega as relações 1:N em subconsultas próprias antes de combiná-las,
// para que nenhum JOIN multiplique totais.
export function dashboardRepository(pool: Pool, academic = false) {
  async function rows<T = RowDataPacket>(sql: string, args: Arg[] = []) {
    const [result] = await pool.execute<RowDataPacket[]>(sql, args);
    return result as unknown as T[];
  }
  return {
    salesByStatus: (range: Range) => rows<{ status: string; vendas: number; valor: string }>(
      `SELECT status, COUNT(*) AS vendas, COALESCE(SUM(valor_total), 0) AS valor FROM venda
       WHERE data_hora >= ? AND data_hora < ? GROUP BY status`, [range.desde, range.ate]),
    openSalesNow: async () => (await rows<{ n: number }>("SELECT COUNT(*) AS n FROM venda WHERE status='ABERTA'"))[0].n,
    ordersByStatusNow: () => rows<{ status: string; pedidos: number }>('SELECT status, COUNT(*) AS pedidos FROM pedido_compra GROUP BY status'),
    openSessionsNow: async () => (await rows<{ n: number }>('SELECT COUNT(*) AS n FROM sessao_caixa WHERE data_fechamento IS NULL'))[0].n,
    revenueSeries: (range: Range, grouping: Grouping) => rows<{ periodo: string; vendas: number; faturamento: string }>(
      `SELECT ${bucketSql('data_hora', grouping)} AS periodo, COUNT(*) AS vendas, SUM(valor_total) AS faturamento
       FROM ${academic ? 'vw_vendas_finalizadas WHERE' : "venda WHERE status='FINALIZADA' AND"}
       data_hora >= ? AND data_hora < ? GROUP BY periodo ORDER BY periodo`, [range.desde, range.ate]),
    topProducts: (range: Range, filter: { categoria: number | null; produto: number | null; limite: number }) => rows<{
      id_produto: number; nome: string; codigo_barras: string; unidade_medida: string; categoria: string; quantidade: string; receita: string; vendas: number }>(
      `SELECT p.id_produto, p.nome, p.codigo_barras, p.unidade_medida, c.nome AS categoria,
         SUM(i.quantidade) AS quantidade, SUM(${saleLine}) AS receita, COUNT(DISTINCT i.id_venda) AS vendas
       FROM item_venda i JOIN venda v ON v.id_venda = i.id_venda JOIN produto p ON p.id_produto = i.id_produto
       JOIN categoria c ON c.id_categoria = p.id_categoria
       WHERE v.status = 'FINALIZADA' AND v.data_hora >= ? AND v.data_hora < ? AND ${notCancelled}
         AND (? IS NULL OR p.id_categoria = ?) AND (? IS NULL OR p.id_produto = ?)
       GROUP BY p.id_produto, p.nome, p.codigo_barras, p.unidade_medida, c.nome
       ORDER BY receita DESC, p.id_produto LIMIT ?`,
      [range.desde, range.ate, filter.categoria, filter.categoria, filter.produto, filter.produto, filter.limite]),
    quantitiesByUnit: (range: Range, filter: { categoria: number | null; produto: number | null }) => rows<{ unidade_medida: string; quantidade: string; receita: string; produtos: number }>(
      `SELECT p.unidade_medida, SUM(i.quantidade) AS quantidade, SUM(${saleLine}) AS receita, COUNT(DISTINCT p.id_produto) AS produtos
       FROM item_venda i JOIN venda v ON v.id_venda = i.id_venda JOIN produto p ON p.id_produto = i.id_produto
       WHERE v.status = 'FINALIZADA' AND v.data_hora >= ? AND v.data_hora < ? AND ${notCancelled}
         AND (? IS NULL OR p.id_categoria = ?) AND (? IS NULL OR p.id_produto = ?)
       GROUP BY p.unidade_medida ORDER BY p.unidade_medida`,
      [range.desde, range.ate, filter.categoria, filter.categoria, filter.produto, filter.produto]),
    paymentsByForm: (range: Range) => rows<{ id_forma_pagamento: number; descricao: string; dinheiro: number; pagamentos: number; vendas: number;
      aplicado: string; recebido: string; troco: string }>(
      `SELECT fp.id_forma_pagamento, fp.descricao, ${CASH_FORM_SQL} AS dinheiro, COUNT(*) AS pagamentos, COUNT(DISTINCT p.id_venda) AS vendas,
         SUM(p.valor) AS aplicado, SUM(COALESCE(p.valor_recebido, p.valor)) AS recebido, SUM(COALESCE(p.troco, 0)) AS troco
       FROM pagamento p JOIN venda v ON v.id_venda = p.id_venda JOIN forma_pagamento fp ON fp.id_forma_pagamento = p.id_forma_pagamento
       WHERE v.status = 'FINALIZADA' AND v.data_hora >= ? AND v.data_hora < ?
       GROUP BY fp.id_forma_pagamento, fp.descricao ORDER BY aplicado DESC, fp.id_forma_pagamento`, [range.desde, range.ate]),
    multiPaymentSales: async (range: Range) => (await rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM (SELECT p.id_venda FROM pagamento p JOIN venda v ON v.id_venda = p.id_venda
       WHERE v.status = 'FINALIZADA' AND v.data_hora >= ? AND v.data_hora < ? GROUP BY p.id_venda HAVING COUNT(*) > 1) x`, [range.desde, range.ate]))[0].n,
    stockByProduct: (today: string, categoria: number | null) => rows<{ id_produto: number; nome: string; codigo_barras: string; categoria: string;
      unidade_medida: string; ativo: number; estoque_minimo: string; estoque_maximo: string; fisico: string; disponivel: string; vencido: string; lotes: number }>(
      `SELECT p.id_produto, p.nome, p.codigo_barras, c.nome AS categoria, p.unidade_medida, p.ativo, p.estoque_minimo, p.estoque_maximo,
         COALESCE(s.fisico, 0) AS fisico, IF(p.ativo = 1, COALESCE(s.disponivel, 0), 0) AS disponivel, COALESCE(s.vencido, 0) AS vencido, COALESCE(s.lotes, 0) AS lotes
       FROM produto p JOIN categoria c ON c.id_categoria = p.id_categoria
       LEFT JOIN (SELECT id_produto, COUNT(*) AS lotes, SUM(quantidade_atual) AS fisico,
           SUM(IF(data_validade IS NOT NULL AND data_validade < ?, quantidade_atual, 0)) AS vencido,
           SUM(IF(quantidade_atual > 0 AND (data_validade IS NULL OR data_validade >= ?), quantidade_atual, 0)) AS disponivel
         FROM lote GROUP BY id_produto) s ON s.id_produto = p.id_produto
       WHERE (? IS NULL OR p.id_categoria = ?) ORDER BY p.nome, p.id_produto`, [today, today, categoria, categoria]),
    lotAlerts: (today: string, horizon: string) => rows<{ id_lote: number; codigo_lote: string; id_produto: number; produto: string; unidade_medida: string;
      data_validade: string | null; quantidade_atual: string; situacao: 'VENCIDO' | 'PROXIMO' | 'SEM_VALIDADE' }>(
      `SELECT * FROM (SELECT l.id_lote, l.codigo_lote, l.id_produto, p.nome AS produto, p.unidade_medida, l.data_validade, l.quantidade_atual,
         CASE WHEN l.data_validade IS NULL THEN 'SEM_VALIDADE' WHEN l.data_validade < ? THEN 'VENCIDO'
              WHEN l.data_validade <= ? THEN 'PROXIMO' END AS situacao
       FROM lote l JOIN produto p ON p.id_produto = l.id_produto WHERE l.quantidade_atual > 0) a
       WHERE situacao IS NOT NULL ORDER BY FIELD(situacao, 'VENCIDO', 'PROXIMO', 'SEM_VALIDADE'), data_validade, id_lote`, [today, horizon]),
    movements: (range: Range, filter: { produto: number | null; lote: number | null; tipo: string | null }, page: number, size: number) => rows<{
      id_movimentacao: number; data_hora: string; tipo: string; quantidade: string; id_lote: number; codigo_lote: string; produto: string;
      unidade_medida: string; id_item_venda: number | null; observacao: string | null; funcionario: string | null }>(
      `SELECT m.id_movimentacao, m.data_hora, m.tipo, m.quantidade, m.id_lote, l.codigo_lote, p.nome AS produto, p.unidade_medida,
         m.id_item_venda, m.observacao, f.matricula AS funcionario
       FROM movimentacao_estoque m JOIN lote l ON l.id_lote = m.id_lote JOIN produto p ON p.id_produto = l.id_produto
       LEFT JOIN funcionario f ON f.id_funcionario = m.id_funcionario
       WHERE m.data_hora >= ? AND m.data_hora < ? AND (? IS NULL OR l.id_produto = ?) AND (? IS NULL OR m.id_lote = ?) AND (? IS NULL OR m.tipo = ?)
       ORDER BY m.data_hora DESC, m.id_movimentacao DESC LIMIT ? OFFSET ?`,
      [range.desde, range.ate, filter.produto, filter.produto, filter.lote, filter.lote, filter.tipo, filter.tipo, size + 1, (page - 1) * size]),
    movementTotals: (range: Range, filter: { produto: number | null; lote: number | null; tipo: string | null }) => rows<{
      tipo: string; unidade_medida: string; movimentacoes: number; quantidade: string; positivo: string; negativo: string }>(
      `SELECT m.tipo, p.unidade_medida, COUNT(*) AS movimentacoes, SUM(m.quantidade) AS quantidade,
         SUM(IF(m.quantidade > 0, m.quantidade, 0)) AS positivo, SUM(IF(m.quantidade < 0, m.quantidade, 0)) AS negativo
       FROM movimentacao_estoque m JOIN lote l ON l.id_lote = m.id_lote JOIN produto p ON p.id_produto = l.id_produto
       WHERE m.data_hora >= ? AND m.data_hora < ? AND (? IS NULL OR l.id_produto = ?) AND (? IS NULL OR m.id_lote = ?) AND (? IS NULL OR m.tipo = ?)
       GROUP BY m.tipo, p.unidade_medida ORDER BY FIELD(m.tipo, 'ENTRADA', 'SAIDA_VENDA', 'PERDA', 'AJUSTE'), p.unidade_medida`,
      [range.desde, range.ate, filter.produto, filter.produto, filter.lote, filter.lote, filter.tipo, filter.tipo]),
    ordersByStatus: (range: Range, fornecedor: number | null) => rows<{ status: string; pedidos: number; valor: string }>(
      `SELECT pc.status, COUNT(*) AS pedidos, COALESCE(SUM(t.valor), 0) AS valor
       FROM pedido_compra pc LEFT JOIN (SELECT i.id_pedido, SUM(${purchaseLine}) AS valor FROM item_pedido_compra i GROUP BY i.id_pedido) t ON t.id_pedido = pc.id_pedido
       WHERE pc.data_pedido >= ? AND pc.data_pedido < ? AND (? IS NULL OR pc.id_fornecedor = ?)
       GROUP BY pc.status ORDER BY FIELD(pc.status, 'PENDENTE', 'ENVIADO', 'RECEBIDO', 'CANCELADO')`, [range.desde, range.ate, fornecedor, fornecedor]),
    awaitingReceipt: (fornecedor: number | null) => rows<{ id_pedido: number; fornecedor: string; data_pedido: string; data_prevista: string | null; status: string; valor: string; itens: number }>(
      `SELECT pc.id_pedido, COALESCE(fo.nome_fantasia, fo.razao_social) AS fornecedor, pc.data_pedido, pc.data_prevista, pc.status,
         COALESCE(t.valor, 0) AS valor, COALESCE(t.itens, 0) AS itens
       FROM pedido_compra pc JOIN fornecedor fo ON fo.id_fornecedor = pc.id_fornecedor
       LEFT JOIN (SELECT i.id_pedido, SUM(${purchaseLine}) AS valor, COUNT(*) AS itens FROM item_pedido_compra i GROUP BY i.id_pedido) t ON t.id_pedido = pc.id_pedido
       WHERE pc.status IN ('PENDENTE', 'ENVIADO') AND (? IS NULL OR pc.id_fornecedor = ?)
       ORDER BY pc.data_prevista IS NULL, pc.data_prevista, pc.id_pedido LIMIT 50`, [fornecedor, fornecedor]),
    suppliers: (range: Range, fornecedor: number | null) => rows<{ id_fornecedor: number; fornecedor: string; ativo: number; pedidos: number; pendentes: number;
      enviados: number; recebidos: number; cancelados: number; valor_total: string; valor_recebido: string; produtos_fornecidos: number;
      recebidos_com_prazo: number; recebidos_com_atraso: number }>(
      `SELECT fo.id_fornecedor, COALESCE(fo.nome_fantasia, fo.razao_social) AS fornecedor, fo.ativo,
         COALESCE(o.pedidos, 0) AS pedidos, COALESCE(o.pendentes, 0) AS pendentes, COALESCE(o.enviados, 0) AS enviados,
         COALESCE(o.recebidos, 0) AS recebidos, COALESCE(o.cancelados, 0) AS cancelados,
         COALESCE(o.valor_total, 0) AS valor_total, COALESCE(o.valor_recebido, 0) AS valor_recebido,
         COALESCE(pf.produtos, 0) AS produtos_fornecidos, COALESCE(o.com_prazo, 0) AS recebidos_com_prazo, COALESCE(o.atrasados, 0) AS recebidos_com_atraso
       FROM fornecedor fo
       LEFT JOIN (SELECT pc.id_fornecedor, COUNT(*) AS pedidos, SUM(pc.status = 'PENDENTE') AS pendentes, SUM(pc.status = 'ENVIADO') AS enviados,
           SUM(pc.status = 'RECEBIDO') AS recebidos, SUM(pc.status = 'CANCELADO') AS cancelados,
           SUM(IF(pc.status <> 'CANCELADO', COALESCE(t.valor, 0), 0)) AS valor_total,
           SUM(IF(pc.status = 'RECEBIDO', COALESCE(t.valor, 0), 0)) AS valor_recebido,
           SUM(pc.status = 'RECEBIDO' AND pc.data_prevista IS NOT NULL) AS com_prazo,
           SUM(pc.status = 'RECEBIDO' AND pc.data_prevista IS NOT NULL AND ${localDate('pc.data_recebimento')} > pc.data_prevista) AS atrasados
         FROM pedido_compra pc LEFT JOIN (SELECT i.id_pedido, SUM(${purchaseLine}) AS valor FROM item_pedido_compra i GROUP BY i.id_pedido) t ON t.id_pedido = pc.id_pedido
         WHERE pc.data_pedido >= ? AND pc.data_pedido < ? GROUP BY pc.id_fornecedor) o ON o.id_fornecedor = fo.id_fornecedor
       LEFT JOIN (SELECT id_fornecedor, COUNT(*) AS produtos FROM produto_fornecedor GROUP BY id_fornecedor) pf ON pf.id_fornecedor = fo.id_fornecedor
       WHERE (? IS NULL OR fo.id_fornecedor = ?)
       ORDER BY pedidos DESC, valor_total DESC, fo.id_fornecedor LIMIT 50`, [range.desde, range.ate, fornecedor, fornecedor]),
    sessions: (range: Range, operador: number | null) => rows<{ id_sessao: number; numero: number; id_operador: number; operador: string; matricula: string;
      data_abertura: string; data_fechamento: string | null; fundo_troco: string; valor_contado: string | null }>(
      `SELECT s.id_sessao, c.numero, s.id_operador, f.nome AS operador, f.matricula, s.data_abertura, s.data_fechamento, s.fundo_troco, s.valor_contado
       FROM sessao_caixa s JOIN caixa c ON c.id_caixa = s.id_caixa JOIN funcionario f ON f.id_funcionario = s.id_operador
       WHERE ((s.data_abertura >= ? AND s.data_abertura < ?) OR s.data_fechamento IS NULL) AND (? IS NULL OR s.id_operador = ?)
       ORDER BY s.data_fechamento IS NULL DESC, s.data_abertura DESC, s.id_sessao DESC LIMIT 50`, [range.desde, range.ate, operador, operador]),
    // Mesmo formato de linhas consumido por cashConference (Script 07), para todas as sessões de uma vez (sem N+1).
    sessionPayments: (sessions: readonly number[]) => sessions.length ? rows<{ id_sessao: number; id_venda: number; status: string; valor_total: string;
      id_pagamento: number | null; valor: string | null; valor_recebido: string | null; troco: string | null; dinheiro: number | null }>(
      `SELECT v.id_sessao, v.id_venda, v.status, v.valor_total, p.id_pagamento, p.valor, p.valor_recebido, p.troco, ${CASH_FORM_SQL} AS dinheiro
       FROM venda v LEFT JOIN pagamento p ON p.id_venda = v.id_venda LEFT JOIN forma_pagamento fp ON fp.id_forma_pagamento = p.id_forma_pagamento
       WHERE v.id_sessao IN (${sessions.map(() => '?').join(',')}) ORDER BY v.id_sessao, v.id_venda, p.id_pagamento`, [...sessions]) : Promise.resolve([]),
    operators: (range: Range, operador: number | null) => rows<{ id_funcionario: number; operador: string; matricula: string; sessoes: number;
      vendas_finalizadas: number; faturamento: string }>(
      `SELECT f.id_funcionario, f.nome AS operador, f.matricula, COALESCE(s.sessoes, 0) AS sessoes,
         COALESCE(v.vendas, 0) AS vendas_finalizadas, COALESCE(v.faturamento, 0) AS faturamento
       FROM funcionario f
       LEFT JOIN (SELECT id_operador, COUNT(*) AS sessoes FROM sessao_caixa WHERE data_abertura >= ? AND data_abertura < ? GROUP BY id_operador) s
         ON s.id_operador = f.id_funcionario
       LEFT JOIN (SELECT sc.id_operador, COUNT(*) AS vendas, SUM(vd.valor_total) AS faturamento FROM venda vd JOIN sessao_caixa sc ON sc.id_sessao = vd.id_sessao
         WHERE vd.status = 'FINALIZADA' AND vd.data_hora >= ? AND vd.data_hora < ? GROUP BY sc.id_operador) v ON v.id_operador = f.id_funcionario
       WHERE (s.sessoes IS NOT NULL OR v.vendas IS NOT NULL) AND (? IS NULL OR f.id_funcionario = ?)
       ORDER BY faturamento DESC, f.id_funcionario`, [range.desde, range.ate, range.desde, range.ate, operador, operador]),
  };
}

export type DashboardRepository = ReturnType<typeof dashboardRepository>;
