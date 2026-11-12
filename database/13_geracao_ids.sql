USE Supermercado;

DELIMITER $$

-- Fluxo acadêmico para ajuste. O ID só é publicado depois do COMMIT.
CREATE PROCEDURE sp_registrar_ajuste_lote(
    IN p_id_lote INT,
    IN p_id_funcionario INT,
    IN p_saldo_contado DECIMAL(10,3),
    IN p_motivo TEXT,
    OUT p_id_movimentacao INT
)
MODIFIES SQL DATA SQL SECURITY INVOKER
BEGIN
    DECLARE v_lock_nome VARCHAR(64) DEFAULT 'sqlider:Supermercado:estoque';
    DECLARE v_lock INT DEFAULT 0;
    DECLARE v_transacao BOOLEAN DEFAULT FALSE;
    DECLARE v_saldo DECIMAL(10,3);
    DECLARE v_id BIGINT;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_saldo = NULL;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        IF v_transacao THEN
            ROLLBACK;
        END IF;
        IF v_lock = 1 THEN
            DO RELEASE_LOCK(v_lock_nome);
        END IF;
        RESIGNAL;
    END;

    SET p_id_movimentacao = NULL;
    IF p_id_lote IS NULL OR p_id_lote <= 0
       OR p_id_funcionario IS NULL OR p_id_funcionario <= 0
       OR p_saldo_contado IS NULL OR p_saldo_contado < 0
       OR p_motivo IS NULL OR CHAR_LENGTH(TRIM(p_motivo)) NOT BETWEEN 3 AND 255 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe lote, funcionário, saldo não negativo e motivo válido.';
    END IF;
    IF @@autocommit <> 1 OR IS_USED_LOCK(v_lock_nome) = CONNECTION_ID() THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Use uma conexão em autocommit sem transação nem lock de estoque.';
    END IF;

    SET v_lock = GET_LOCK(v_lock_nome, 5);
    IF COALESCE(v_lock, 0) <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Estoque ocupado. Tente novamente.';
    END IF;

    -- SET TRANSACTION falha se o chamador já iniciou uma transação.
    SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
    START TRANSACTION;
    SET v_transacao = TRUE;

    SELECT quantidade_atual INTO v_saldo FROM lote WHERE id_lote = p_id_lote FOR UPDATE;
    IF v_saldo IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lote inexistente.';
    END IF;
    IF p_saldo_contado = v_saldo THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Saldo já registrado para o lote.';
    END IF;

    UPDATE lote SET quantidade_atual = p_saldo_contado WHERE id_lote = p_id_lote;

    -- Estoque, recebimento e checkout da API usam o mesmo lock até o COMMIT.
    SELECT GREATEST(COALESCE(MAX(id_movimentacao), 0), 0) + 1 INTO v_id
    FROM movimentacao_estoque;
    IF v_id > 2147483647 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Limite INT de movimentação atingido.';
    END IF;

    INSERT INTO movimentacao_estoque
        (id_movimentacao, id_lote, id_funcionario, tipo, quantidade, data_hora, observacao)
    VALUES
        (v_id, p_id_lote, p_id_funcionario, 'AJUSTE', p_saldo_contado - v_saldo, UTC_TIMESTAMP(), TRIM(p_motivo));

    COMMIT;
    SET v_transacao = FALSE;
    DO RELEASE_LOCK(v_lock_nome);
    SET v_lock = 0;
    SET p_id_movimentacao = v_id;
END$$

DELIMITER ;
