// Verificação das consultas do dashboard em MySQL REAL e DESCARTÁVEL (nunca a instância oficial 3307).
// Carrega o DDL e o DML oficiais, acrescenta fixtures controladas e compara as respostas com valores
// calculados à mão a partir desses dados. A leitura é feita por uma conta com SELECT apenas.
// Uso: S10_DB_PORT=3320 S10_ROOT_PASSWORD=... npx tsx tests/integration/dashboard-sql.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createConnection, createPool } from 'mysql2/promise';
import { dashboardRepository } from '../../src/modules/dashboard/repository.js';
import { dashboardService } from '../../src/modules/dashboard/routes.js';

const port = Number(process.env.S10_DB_PORT);
if (!port || port === 3307) throw new Error('Informe a porta de uma instância DESCARTÁVEL (nunca 3307).');
const official = new URL('../../../database/official/', import.meta.url);
const NOW = Date.parse('2026-11-10T13:50:00Z'); // "hoje" fixo: 10/11/2026 em Brasília

const root = await createConnection({ host: '127.0.0.1', port, user: 'root', password: process.env.S10_ROOT_PASSWORD, multipleStatements: true, charset: 'utf8mb4' });
await root.query('DROP DATABASE IF EXISTS Supermercado');
await root.query(readFileSync(new URL('Supermercado_ddl.sql', official), 'utf8'));
await root.query(readFileSync(new URL('Supermercado_dml.sql', official), 'utf8'));
await root.query(`USE Supermercado;
INSERT INTO produto (id_produto,codigo_barras,nome,descricao,id_categoria,id_marca,unidade_medida,preco_venda,estoque_minimo,estoque_maximo,ativo) VALUES
 (7,'7890000000007','Leite QA 1L',NULL,2,NULL,'L',4.99,5.000,10.000,1),
 (8,'7890000000008','Sem lote QA',NULL,3,NULL,'UN',1.00,3.000,30.000,1);
INSERT INTO lote (id_lote,id_produto,id_pedido,codigo_lote,data_fabricacao,data_validade,data_entrada,quantidade_inicial,quantidade_atual,custo_unitario) VALUES
 (10,7,NULL,'LT-QA-10',NULL,'2026-11-20','2026-11-02 10:00:00',20.000,20.000,3.00),
 (11,7,NULL,'LT-QA-11',NULL,NULL,'2026-11-02 10:00:00',1.000,1.000,3.00);
INSERT INTO venda (id_venda,id_sessao,data_hora,valor_total,status) VALUES
 (6,2,'2026-11-05 01:30:00',7.49,'FINALIZADA'),
 (7,3,'2026-11-07 15:00:00',49.95,'ABERTA');
INSERT INTO item_venda (id_item_venda,id_venda,id_produto,quantidade,preco_unitario,subtotal) VALUES
 (11,6,7,1.500,4.99,7.49),(12,6,1,1.000,28.90,28.90),(13,7,3,5.000,9.99,49.95);
INSERT INTO cancelamento_item (id_cancelamento,id_item_venda,id_supervisor,data_hora,motivo) VALUES (3,12,2,'2026-11-05 01:29:00','Fixture QA-S10');
INSERT INTO pagamento (id_pagamento,id_venda,id_forma_pagamento,valor,valor_recebido,troco,data_hora) VALUES
 (5,6,4,5.00,5.00,0.00,'2026-11-05 01:31:00'),(6,6,2,2.49,2.49,0.00,'2026-11-05 01:31:00'),
 (7,7,4,1.00,1.00,0.00,'2026-11-07 15:01:00');
INSERT INTO movimentacao_estoque (id_movimentacao,id_lote,id_item_venda,id_funcionario,tipo,quantidade,data_hora,observacao) VALUES
 (12,2,NULL,1,'AJUSTE',1.000,'2026-11-06 12:00:00','QA-S10'),(13,2,NULL,1,'AJUSTE',-0.500,'2026-11-06 12:05:00','QA-S10'),
 (14,3,NULL,1,'PERDA',0.250,'2026-11-06 12:10:00','QA-S10');
INSERT INTO pedido_compra (id_pedido,id_fornecedor,id_funcionario,data_pedido,data_prevista,data_recebimento,status,observacao) VALUES
 (6,2,5,'2026-11-08 12:00:00',NULL,NULL,'PENDENTE','QA-S10'),
 (7,2,5,'2026-11-08 13:00:00',NULL,NULL,'CANCELADO','QA-S10'),
 (8,3,5,'2026-11-01 10:00:00','2026-11-03','2026-11-06 12:00:00','RECEBIDO','QA-S10');
INSERT INTO item_pedido_compra (id_pedido,id_produto,quantidade,custo_unitario) VALUES (6,3,10.000,7.33),(7,4,5.000,2.00),(8,4,3.000,1.90);
DROP USER IF EXISTS 'dashboard_leitura'@'%';
CREATE USER 'dashboard_leitura'@'%' IDENTIFIED BY 'somente-leitura-descartavel';
GRANT SELECT ON Supermercado.* TO 'dashboard_leitura'@'%';`);
await root.end();

const pool = createPool({ host: '127.0.0.1', port, user: 'dashboard_leitura', password: 'somente-leitura-descartavel', database: 'Supermercado', dateStrings: true, decimalNumbers: false });
const service = dashboardService(dashboardRepository(pool), () => NOW);
const nov = { inicio: '2026-11-01', fim: '2026-11-10' };
try {
  const resumo = await service.resumo({ ...nov, dias: 30 });
  assert.equal(resumo.faturamento, '158.25'); // vendas 1,2,3 (DML) + 6 (fixture); ABERTA 5,7 e CANCELADA 4 fora
  assert.equal(resumo.vendas_finalizadas, 4);
  assert.equal(resumo.ticket_medio, '39.56'); // 158,25 / 4 = 39,5625
  assert.deepEqual(resumo.vendas_por_status, { ABERTA: { vendas: 2, valor: '88.84' }, FINALIZADA: { vendas: 4, valor: '158.25' }, CANCELADA: { vendas: 1, valor: '19.56' } });
  assert.equal(resumo.vendas_abertas_agora, 2);
  assert.deepEqual(resumo.pedidos_por_status, { PENDENTE: 1, ENVIADO: 1, RECEBIDO: 5, CANCELADO: 1 });
  assert.equal(resumo.produtos_estoque_baixo, 1);
  assert.equal(resumo.lotes_proximos_vencimento, 1);
  assert.equal(resumo.caixas_abertos, 1);
  const empty = await service.resumo({ inicio: '2026-12-01', fim: '2026-12-31', dias: 30 });
  assert.deepEqual([empty.faturamento, empty.vendas_finalizadas, empty.ticket_medio], ['0.00', 0, null]);

  const serie = await service.serie({ ...nov, agrupamento: 'dia' });
  assert.equal(serie.pontos.length, 10);
  assert.deepEqual(serie.pontos.filter(p => !p.sem_registro), [
    { periodo: '2026-11-03', vendas: 2, faturamento: '62.99', sem_registro: false },
    { periodo: '2026-11-04', vendas: 2, faturamento: '95.26', sem_registro: false }]); // venda 6: 01:30 UTC de 05/11 = 22:30 de 04/11
  assert.deepEqual((await service.serie({ ...nov, agrupamento: 'semana' })).pontos.map(p => [p.periodo, p.faturamento]),
    [['2026-10-26', '0.00'], ['2026-11-02', '158.25'], ['2026-11-09', '0.00']]);
  assert.deepEqual((await service.serie({ ...nov, agrupamento: 'mes' })).pontos.map(p => [p.periodo, p.faturamento]), [['2026-11-01', '158.25']]);

  const produtos = await service.produtos({ ...nov, limite: 10 });
  assert.deepEqual(produtos.ranking.map(r => [r.id_produto, r.quantidade, r.receita, r.vendas]), [
    [1, '3.000', '86.70', 2], [3, '3.000', '29.97', 1], [2, '2.000', '16.98', 1], [5, '1.250', '8.74', 1], [4, '3.000', '8.37', 1], [7, '1.500', '7.49', 1]]);
  // item 12 (arroz cancelado, 28,90) e item 13 (venda ABERTA) não entram; preço histórico do item, não do catálogo
  assert.deepEqual(produtos.por_unidade, [
    { unidade_medida: 'UN', quantidade: '11.000', receita: '142.02', produtos: 4 },
    { unidade_medida: 'KG', quantidade: '1.250', receita: '8.74', produtos: 1 },
    { unidade_medida: 'L', quantidade: '1.500', receita: '7.49', produtos: 1 }]); // ENUM ordena pela declaração: UN, KG, L
  assert.equal((await service.produtos({ ...nov, categoria: 2, limite: 10 })).ranking.map(r => r.id_produto).join(), '7');

  const pagamentos = await service.pagamentos(nov);
  assert.deepEqual(pagamentos.formas.map(f => [f.descricao, f.pagamentos, f.vendas, f.aplicado, f.recebido, f.troco]), [
    ['Cartão de Crédito', 1, 1, '70.00', '70.00', '0.00'], ['Dinheiro', 2, 2, '63.65', '70.00', '6.35'],
    ['Pix', 2, 2, '22.11', '22.11', '0.00'], ['Cartão de Débito', 1, 1, '2.49', '2.49', '0.00']]); // Pix da venda ABERTA 7 fora
  assert.deepEqual(pagamentos.dinheiro_fisico, { recebido: '70.00', troco: '6.35', aplicado: '63.65' });
  assert.equal(pagamentos.vendas_com_pagamento_multiplo, 2);
  assert.deepEqual(pagamentos.conciliacao, { faturamento_vendas: '158.25', total_aplicado: '158.25', diferenca: '0.00' });

  const estoque = await service.estoque({ dias: 30 });
  assert.deepEqual(estoque.totais, { abaixo_minimo: 1, acima_maximo: 1, sem_lotes: 1, lotes_vencidos: 1, lotes_proximos: 1, lotes_sem_validade: 1 });
  const byId = new Map(estoque.produtos.map(p => [p.id_produto, p]));
  assert.deepEqual([byId.get(8)!.fisico, byId.get(8)!.situacao], ['0.000', 'BAIXO']); // produto sem lotes
  assert.deepEqual([byId.get(7)!.fisico, byId.get(7)!.situacao, byId.get(7)!.lotes], ['21.000', 'ACIMA', 2]);
  assert.deepEqual([byId.get(5)!.fisico, byId.get(5)!.disponivel, byId.get(5)!.vencido], ['48.750', '0.000', '48.750']); // vencido não é vendável
  assert.equal(byId.get(1)!.fisico, '97.000'); // sem multiplicação por movimentações
  assert.deepEqual(estoque.lotes.map(l => [l.id_lote, l.situacao]), [[5, 'VENCIDO'], [10, 'PROXIMO'], [11, 'SEM_VALIDADE']]);

  const mov = await service.movimentacoes({ ...nov, pagina: 1 });
  assert.deepEqual(mov.totais.map(t => [t.tipo, t.unidade_medida, t.movimentacoes, t.quantidade, t.positivo, t.negativo]), [
    ['ENTRADA', 'UN', 1, '200.000', '200.000', '0.000'], ['ENTRADA', 'KG', 1, '50.000', '50.000', '0.000'],
    ['SAIDA_VENDA', 'UN', 5, '11.000', '11.000', '0.000'], ['SAIDA_VENDA', 'KG', 1, '1.250', '1.250', '0.000'],
    ['PERDA', 'UN', 1, '0.250', '0.250', '0.000'], ['AJUSTE', 'UN', 2, '0.500', '1.000', '-0.500']]);
  assert.equal((await service.movimentacoes({ ...nov, tipo: 'AJUSTE', pagina: 1 })).items.length, 2);
  assert.equal((await service.movimentacoes({ ...nov, lote: 5, pagina: 1 })).items.length, 2);

  const compras = await service.compras({ inicio: '2026-10-01', fim: '2026-11-10' });
  assert.deepEqual(compras.por_status, { PENDENTE: { pedidos: 1, valor: '73.30' }, ENVIADO: { pedidos: 1, valor: '620.00' },
    RECEBIDO: { pedidos: 5, valor: '4355.70' }, CANCELADO: { pedidos: 1, valor: '10.00' } });
  assert.equal(compras.total_pedidos, 8);
  assert.equal(compras.valor_estimado, '5049.00'); // cancelado fora; custo histórico do item, não produto_fornecedor
  assert.deepEqual(compras.aguardando_recebimento.map(p => [p.id_pedido, p.status, p.atrasado]), [[5, 'ENVIADO', false], [6, 'PENDENTE', false]]);

  const fornecedores = await service.fornecedores({ inicio: '2026-10-01', fim: '2026-11-10' });
  assert.deepEqual(fornecedores.items.slice(0, 4).map(f => [f.id_fornecedor, f.pedidos, f.recebidos, f.cancelados, f.valor_total, f.valor_recebido, f.recebidos_com_prazo, f.recebidos_com_atraso]), [
    [2, 3, 1, 1, '1553.30', '1480.00', 1, 0], [1, 2, 1, 0, '2870.00', '2250.00', 1, 0],
    [3, 2, 2, 0, '385.70', '385.70', 2, 1], [4, 1, 1, 0, '240.00', '240.00', 1, 0]]);

  const caixas = await service.caixas(nov);
  const sessions = new Map(caixas.sessoes.map(s => [s.id_sessao, s]));
  assert.deepEqual([caixas.abertas, caixas.fechadas], [1, 2]);
  assert.deepEqual(['recebido_dinheiro', 'valor_esperado', 'diferenca', 'resultado'].map(k => sessions.get(1)![k as 'resultado']), ['45.88', '245.88', '0.00', 'CONFERIDO']);
  assert.deepEqual(['recebido_dinheiro', 'valor_esperado', 'diferenca', 'resultado'].map(k => sessions.get(2)![k as 'resultado']), ['17.77', '167.77', '0.00', 'CONFERIDO']);
  assert.deepEqual([sessions.get(3)!.situacao, sessions.get(3)!.recebido_dinheiro, sessions.get(3)!.vendas_abertas], ['ABERTA', '0.00', 2]);
  assert.deepEqual(caixas.operadores.map(o => [o.matricula, o.sessoes, o.vendas_finalizadas, o.faturamento]), [['F0004', 1, 2, '95.26'], ['F0003', 2, 2, '62.99']]);
  // F0002 autorizou cancelamentos, mas não operou caixa: não aparece como operador
  console.log('DASHBOARD SQL: todos os indicadores conferem com os valores calculados à mão.');
} finally {
  await pool.end();
}
