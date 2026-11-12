-- Execute com a conta instaladora. As consultas ativas são somente leitura.
USE Supermercado;

SHOW FUNCTION STATUS WHERE Db = DATABASE();
SHOW PROCEDURE STATUS WHERE Db = DATABASE();
SHOW TRIGGERS WHERE `Table` = 'lote';
SHOW CREATE FUNCTION fn_calcular_subtotal;
SHOW CREATE FUNCTION fn_calcular_troco;
SHOW CREATE PROCEDURE sp_consultar_estoque_produto;
SHOW CREATE PROCEDURE sp_consultar_venda;
SHOW CREATE PROCEDURE sp_registrar_ajuste_lote;
SHOW CREATE TRIGGER trg_lote_validar_insert;
SHOW CREATE TRIGGER trg_lote_validar_update;

SELECT fn_calcular_subtotal(3, 28.90) AS subtotal,             -- 86.70
       fn_calcular_subtotal(1.250, 6.99) AS subtotal_fracao,  -- 8.74
       fn_calcular_troco(130.38, 150.00) AS troco;            -- 19.62

CALL sp_consultar_estoque_produto(5, '2026-11-09'); -- físico e vendável 48.750
CALL sp_consultar_estoque_produto(5, '2026-11-10'); -- físico 48.750, vendável 0
CALL sp_consultar_venda(3); -- um cabeçalho, dois itens e dois pagamentos
CALL sp_consultar_venda(4); -- dois itens marcados e dois cancelamentos

SELECT IS_FREE_LOCK('sqlider:Supermercado:estoque') AS lock_livre;

-- Execute cada teste negativo separadamente.
-- SELECT fn_calcular_subtotal(2, 99999999.99);              -- excede DECIMAL(10,2)
-- SELECT fn_calcular_troco(130.38, 100.00);                  -- valor recebido inferior
-- CALL sp_consultar_estoque_produto(999, '2026-11-09');      -- produto inexistente
-- CALL sp_consultar_venda(999);                             -- venda inexistente

-- Somente na instância isolada. A FK inválida falha após o UPDATE interno.
-- SELECT quantidade_atual FROM lote WHERE id_lote = 1;      -- 97.000 na carga nova
-- CALL sp_registrar_ajuste_lote(1, 999, 98.000, 'Teste de rollback', @id);
-- SELECT quantidade_atual FROM lote WHERE id_lote = 1;      -- continua 97.000
-- SELECT IS_FREE_LOCK('sqlider:Supermercado:estoque');       -- 1
