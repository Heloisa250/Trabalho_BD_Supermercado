USE Supermercado;

DELIMITER $$

CREATE PROCEDURE sp_consultar_estoque_produto(IN p_id_produto INT, IN p_data_comercial DATE)
READS SQL DATA SQL SECURITY INVOKER
BEGIN
    IF p_id_produto IS NULL OR p_id_produto <= 0 OR p_data_comercial IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe ID de produto positivo e data comercial.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM produto WHERE id_produto = p_id_produto) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Produto inexistente.';
    END IF;

    SELECT e.id_produto, e.nome, e.unidade_medida, e.ativo, e.estoque_fisico,
           CASE WHEN e.ativo = 1 THEN COALESCE((
               SELECT SUM(l.quantidade_atual)
               FROM lote l
               WHERE l.id_produto = e.id_produto AND l.quantidade_atual > 0
                 AND (l.data_validade IS NULL OR l.data_validade >= p_data_comercial)
           ), 0.000) ELSE 0.000 END AS estoque_vendavel,
           e.estoque_minimo, e.estoque_maximo, e.situacao_estoque
    FROM vw_estoque_produtos e
    WHERE e.id_produto = p_id_produto;
END$$

CREATE PROCEDURE sp_consultar_venda(IN p_id_venda INT)
READS SQL DATA SQL SECURITY INVOKER
BEGIN
    IF p_id_venda IS NULL OR p_id_venda <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe ID de venda positivo.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM venda WHERE id_venda = p_id_venda) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Venda inexistente.';
    END IF;

    SELECT v.id_venda, v.status, v.data_hora, v.valor_total,
           sc.id_operador, f.nome AS operador, c.numero AS numero_caixa
    FROM venda v
    JOIN sessao_caixa sc ON sc.id_sessao = v.id_sessao
    JOIN funcionario f ON f.id_funcionario = sc.id_operador
    JOIN caixa c ON c.id_caixa = sc.id_caixa
    WHERE v.id_venda = p_id_venda;

    SELECT i.id_item_venda, i.id_produto, p.nome AS produto, p.unidade_medida,
           i.quantidade, i.preco_unitario, i.subtotal,
           EXISTS (SELECT 1 FROM cancelamento_item ci WHERE ci.id_item_venda = i.id_item_venda) AS cancelado
    FROM item_venda i
    JOIN produto p ON p.id_produto = i.id_produto
    WHERE i.id_venda = p_id_venda
    ORDER BY i.id_item_venda;

    SELECT ci.id_cancelamento, ci.id_item_venda, ci.data_hora, ci.motivo
    FROM cancelamento_item ci
    JOIN item_venda i ON i.id_item_venda = ci.id_item_venda
    WHERE i.id_venda = p_id_venda
    ORDER BY ci.id_cancelamento;

    SELECT pg.id_pagamento, fp.descricao AS forma_pagamento,
           pg.valor, pg.valor_recebido, pg.troco, pg.data_hora
    FROM pagamento pg
    JOIN forma_pagamento fp ON fp.id_forma_pagamento = pg.id_forma_pagamento
    WHERE pg.id_venda = p_id_venda
    ORDER BY pg.id_pagamento;
END$$

DELIMITER ;
