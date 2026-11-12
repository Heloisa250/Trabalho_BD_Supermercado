-- Diagnóstico somente leitura. Execute na instância acadêmica após 12, 14 e 15.
USE Supermercado;

SELECT VERSION(), @@port, CURRENT_USER();
SHOW FULL TABLES;
SHOW CREATE VIEW vw_vendas_finalizadas;
SHOW CREATE VIEW vw_estoque_produtos;
SELECT * FROM vw_vendas_finalizadas ORDER BY id_venda;
SELECT * FROM vw_estoque_produtos ORDER BY id_produto;

-- Esperado: zero divergências. Subconsultas correlacionadas recontam a base.
SELECT COUNT(*) AS divergencias_vendas
FROM venda v
LEFT JOIN vw_vendas_finalizadas w USING (id_venda)
WHERE (v.status = 'FINALIZADA') <> (w.id_venda IS NOT NULL)
   OR (w.id_venda IS NOT NULL AND (
       w.valor_total <> v.valor_total
       OR w.itens_ativos <> (
           SELECT COUNT(*) FROM item_venda i
           LEFT JOIN cancelamento_item ci USING (id_item_venda)
           WHERE i.id_venda = v.id_venda AND ci.id_cancelamento IS NULL
       )
       OR w.pagamentos <> (SELECT COUNT(*) FROM pagamento p WHERE p.id_venda = v.id_venda)
       OR w.valor_pago <> (SELECT COALESCE(SUM(p.valor), 0) FROM pagamento p WHERE p.id_venda = v.id_venda)
       OR w.troco_total <> (SELECT COALESCE(SUM(p.troco), 0) FROM pagamento p WHERE p.id_venda = v.id_venda)
   ));

SELECT COUNT(*) AS divergencias_estoque
FROM produto p
LEFT JOIN vw_estoque_produtos w USING (id_produto)
WHERE w.id_produto IS NULL OR w.estoque_fisico <> (
    SELECT COALESCE(SUM(l.quantidade_atual), 0) FROM lote l WHERE l.id_produto = p.id_produto
);

SHOW CREATE TABLE usuarios;
SHOW CREATE TABLE grupos_usuarios;
SELECT f.matricula, u.codigo_grupo, c.pode_cancelar_item
FROM usuarios u
JOIN funcionario f USING (id_funcionario)
JOIN cargo c USING (id_cargo)
ORDER BY f.matricula;

SELECT CONSTRAINT_TYPE, COUNT(*) AS total
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
GROUP BY CONSTRAINT_TYPE;
SHOW INDEX FROM venda;
SHOW INDEX FROM movimentacao_estoque;
