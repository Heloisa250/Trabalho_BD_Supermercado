-- Execute uma vez. Guarde as duas séries de planos do Workbench.
USE Supermercado;

SELECT 'ANTES' AS fase;
SHOW INDEX FROM venda;
SHOW INDEX FROM pagamento;
SHOW INDEX FROM sessao_caixa;
SHOW INDEX FROM lote;
SHOW INDEX FROM pedido_compra;
SHOW INDEX FROM item_pedido_compra;
SHOW INDEX FROM movimentacao_estoque;

EXPLAIN FORMAT=JSON
SELECT COUNT(*) AS vendas, SUM(valor_total) AS faturamento
FROM venda
WHERE status = 'FINALIZADA' AND data_hora >= '2026-11-03' AND data_hora < '2026-11-05';

EXPLAIN FORMAT=JSON
SELECT id_lote, id_produto, data_validade, quantidade_atual
FROM lote
WHERE quantidade_atual > 0 AND
      CASE WHEN data_validade < '2026-11-06' THEN 'VENCIDO'
           WHEN data_validade <= '2026-12-06' THEN 'PROXIMO'
           WHEN data_validade IS NULL THEN 'SEM_VALIDADE' END IS NOT NULL;

EXPLAIN FORMAT=JSON
SELECT pc.status, COUNT(*) AS pedidos, COALESCE(SUM(t.valor), 0) AS valor
FROM pedido_compra pc
LEFT JOIN (
    SELECT id_pedido, SUM(ROUND(quantidade * custo_unitario, 2)) AS valor
    FROM item_pedido_compra GROUP BY id_pedido
) t ON t.id_pedido = pc.id_pedido
WHERE pc.data_pedido >= '2026-10-20' AND pc.data_pedido < '2026-11-10'
  AND pc.id_fornecedor = 1
GROUP BY pc.status;

EXPLAIN FORMAT=JSON
SELECT m.id_movimentacao, m.data_hora, m.tipo, l.codigo_lote, p.nome
FROM movimentacao_estoque m
JOIN lote l ON l.id_lote = m.id_lote
JOIN produto p ON p.id_produto = l.id_produto
WHERE m.data_hora >= '2026-11-03' AND m.data_hora < '2026-11-05'
ORDER BY m.data_hora DESC, m.id_movimentacao DESC
LIMIT 50;

-- Igualdade de status seguida de intervalo por data no faturamento.
CREATE INDEX ix_venda_status_data ON venda (status, data_hora);

-- Intervalo por data na listagem gerencial sem filtro obrigatório de lote.
-- No InnoDB, a PK id_movimentacao também compõe a ordenação do índice secundário.
CREATE INDEX ix_movimentacao_data ON movimentacao_estoque (data_hora);

SELECT 'DEPOIS' AS fase;
SHOW INDEX FROM venda;
SHOW INDEX FROM movimentacao_estoque;

EXPLAIN FORMAT=JSON
SELECT COUNT(*) AS vendas, SUM(valor_total) AS faturamento
FROM venda
WHERE status = 'FINALIZADA' AND data_hora >= '2026-11-03' AND data_hora < '2026-11-05';

EXPLAIN FORMAT=JSON
SELECT id_lote, id_produto, data_validade, quantidade_atual
FROM lote
WHERE quantidade_atual > 0 AND
      CASE WHEN data_validade < '2026-11-06' THEN 'VENCIDO'
           WHEN data_validade <= '2026-12-06' THEN 'PROXIMO'
           WHEN data_validade IS NULL THEN 'SEM_VALIDADE' END IS NOT NULL;

EXPLAIN FORMAT=JSON
SELECT pc.status, COUNT(*) AS pedidos, COALESCE(SUM(t.valor), 0) AS valor
FROM pedido_compra pc
LEFT JOIN (
    SELECT id_pedido, SUM(ROUND(quantidade * custo_unitario, 2)) AS valor
    FROM item_pedido_compra GROUP BY id_pedido
) t ON t.id_pedido = pc.id_pedido
WHERE pc.data_pedido >= '2026-10-20' AND pc.data_pedido < '2026-11-10'
  AND pc.id_fornecedor = 1
GROUP BY pc.status;

EXPLAIN FORMAT=JSON
SELECT m.id_movimentacao, m.data_hora, m.tipo, l.codigo_lote, p.nome
FROM movimentacao_estoque m
JOIN lote l ON l.id_lote = m.id_lote
JOIN produto p ON p.id_produto = l.id_produto
WHERE m.data_hora >= '2026-11-03' AND m.data_hora < '2026-11-05'
ORDER BY m.data_hora DESC, m.id_movimentacao DESC
LIMIT 50;
