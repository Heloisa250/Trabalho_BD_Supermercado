-- MySQL 8.4. Execute após o DDL oficial. CREATE VIEW falha se o nome já existir.
USE Supermercado;

CREATE SQL SECURITY INVOKER VIEW vw_vendas_finalizadas AS
SELECT v.id_venda, v.data_hora, v.status, sc.id_operador, f.nome AS operador,
       c.numero AS numero_caixa, v.valor_total,
       COALESCE(i.itens_ativos, 0) AS itens_ativos,
       COALESCE(pg.pagamentos, 0) AS pagamentos,
       COALESCE(pg.formas_pagamento, 0) AS formas_pagamento,
       COALESCE(pg.valor_pago, 0.00) AS valor_pago,
       COALESCE(pg.troco_total, 0.00) AS troco_total
FROM venda v
JOIN sessao_caixa sc ON sc.id_sessao = v.id_sessao
JOIN caixa c ON c.id_caixa = sc.id_caixa
JOIN funcionario f ON f.id_funcionario = sc.id_operador
LEFT JOIN (
    SELECT i.id_venda, COUNT(*) AS itens_ativos
    FROM item_venda i
    WHERE NOT EXISTS (
        SELECT 1 FROM cancelamento_item ci WHERE ci.id_item_venda = i.id_item_venda
    )
    GROUP BY i.id_venda
) i ON i.id_venda = v.id_venda
LEFT JOIN (
    SELECT p.id_venda, COUNT(*) AS pagamentos,
           COUNT(DISTINCT p.id_forma_pagamento) AS formas_pagamento,
           SUM(p.valor) AS valor_pago, SUM(p.troco) AS troco_total
    FROM pagamento p
    GROUP BY p.id_venda
) pg ON pg.id_venda = v.id_venda
WHERE v.status = 'FINALIZADA';

CREATE SQL SECURITY INVOKER VIEW vw_estoque_produtos AS
SELECT p.id_produto, p.nome, p.codigo_barras, c.nome AS categoria, m.nome AS marca,
       p.unidade_medida, p.ativo,
       COALESCE(s.estoque_fisico, 0.000) AS estoque_fisico,
       p.estoque_minimo, p.estoque_maximo,
       CASE
           WHEN COALESCE(s.estoque_fisico, 0) < p.estoque_minimo THEN 'BAIXO'
           WHEN COALESCE(s.estoque_fisico, 0) > p.estoque_maximo THEN 'ALTO'
           ELSE 'NORMAL'
       END AS situacao_estoque
FROM produto p
JOIN categoria c ON c.id_categoria = p.id_categoria
LEFT JOIN marca m ON m.id_marca = p.id_marca
LEFT JOIN (
    SELECT id_produto, SUM(quantidade_atual) AS estoque_fisico
    FROM lote
    GROUP BY id_produto
) s ON s.id_produto = p.id_produto;
