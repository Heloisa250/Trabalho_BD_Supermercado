USE Supermercado;

DELIMITER $$

CREATE FUNCTION fn_calcular_subtotal(
    p_quantidade DECIMAL(10,3), p_preco_unitario DECIMAL(10,2)
)
RETURNS DECIMAL(10,2)
DETERMINISTIC NO SQL SQL SECURITY INVOKER
BEGIN
    DECLARE v_subtotal DECIMAL(20,2);

    IF p_quantidade IS NULL OR p_quantidade <= 0
       OR p_preco_unitario IS NULL OR p_preco_unitario < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe quantidade positiva e preço não negativo.';
    END IF;

    SET v_subtotal = ROUND(p_quantidade * p_preco_unitario, 2);
    IF v_subtotal > 99999999.99 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Subtotal excede DECIMAL(10,2).';
    END IF;

    RETURN v_subtotal;
END$$

CREATE FUNCTION fn_calcular_troco(
    p_valor_aplicado DECIMAL(10,2), p_valor_recebido DECIMAL(10,2)
)
RETURNS DECIMAL(10,2)
DETERMINISTIC NO SQL SQL SECURITY INVOKER
BEGIN
    IF p_valor_aplicado IS NULL OR p_valor_aplicado <= 0 OR p_valor_recebido IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe valor aplicado positivo e valor recebido.';
    END IF;
    IF p_valor_recebido < p_valor_aplicado THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor recebido inferior ao valor aplicado.';
    END IF;

    RETURN p_valor_recebido - p_valor_aplicado;
END$$

DELIMITER ;
