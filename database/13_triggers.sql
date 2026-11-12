USE Supermercado;

DELIMITER $$

CREATE TRIGGER trg_lote_validar_insert
BEFORE INSERT ON lote FOR EACH ROW
BEGIN
    IF NEW.quantidade_inicial < 0 OR NEW.quantidade_atual < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantidade de lote não pode ser negativa.';
    END IF;

    IF NEW.data_fabricacao IS NOT NULL AND NEW.data_validade IS NOT NULL
       AND NEW.data_validade < NEW.data_fabricacao THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validade anterior à fabricação do lote.';
    END IF;
END$$

CREATE TRIGGER trg_lote_validar_update
BEFORE UPDATE ON lote FOR EACH ROW
BEGIN
    IF NEW.quantidade_inicial < 0 OR NEW.quantidade_atual < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantidade de lote não pode ser negativa.';
    END IF;

    IF NEW.data_fabricacao IS NOT NULL AND NEW.data_validade IS NOT NULL
       AND NEW.data_validade < NEW.data_fabricacao THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Validade anterior à fabricação do lote.';
    END IF;
END$$

DELIMITER ;
