-- Aplique depois do Script 14. A conta instaladora executa o ajuste de demonstração.
USE Supermercado;

GRANT SELECT (id_cancelamento, data_hora, motivo) ON Supermercado.cancelamento_item
    TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT (id_forma_pagamento, descricao) ON Supermercado.forma_pagamento
    TO 'supermercado_acad_leitura'@'127.0.0.1';

GRANT EXECUTE ON FUNCTION Supermercado.fn_calcular_subtotal TO
    'supermercado_acad_leitura'@'127.0.0.1', 'supermercado_acad_app'@'127.0.0.1';
GRANT EXECUTE ON FUNCTION Supermercado.fn_calcular_troco TO
    'supermercado_acad_leitura'@'127.0.0.1', 'supermercado_acad_app'@'127.0.0.1';
GRANT EXECUTE ON PROCEDURE Supermercado.sp_consultar_estoque_produto TO
    'supermercado_acad_leitura'@'127.0.0.1', 'supermercado_acad_app'@'127.0.0.1';
GRANT EXECUTE ON PROCEDURE Supermercado.sp_consultar_venda TO
    'supermercado_acad_leitura'@'127.0.0.1', 'supermercado_acad_app'@'127.0.0.1';
