-- Execute uma vez, após o Script 12, com a conta instaladora da instância acadêmica.
-- Os nomes já existentes geram erro. Confira o primeiro erro antes de retomar.
USE Supermercado;

CREATE TABLE grupos_usuarios (
    codigo_grupo VARCHAR(20) PRIMARY KEY
) ENGINE=InnoDB;

CREATE TABLE usuarios (
    id_funcionario INT PRIMARY KEY,
    codigo_grupo VARCHAR(20) NOT NULL,
    CONSTRAINT fk_usuarios_funcionario
        FOREIGN KEY (id_funcionario) REFERENCES funcionario (id_funcionario),
    CONSTRAINT fk_usuarios_grupo
        FOREIGN KEY (codigo_grupo) REFERENCES grupos_usuarios (codigo_grupo)
) ENGINE=InnoDB;

START TRANSACTION;
INSERT INTO grupos_usuarios (codigo_grupo)
VALUES ('ADMINISTRADOR'), ('SUPERVISOR'), ('OPERADOR');

-- LEFT JOIN e PK NOT NULL tornam matrícula ausente um erro em modo estrito.
INSERT INTO usuarios (id_funcionario, codigo_grupo)
SELECT f.id_funcionario, perfil.codigo_grupo
FROM (
    SELECT 'F0001' AS matricula, 'ADMINISTRADOR' AS codigo_grupo
    UNION ALL SELECT 'F0002', 'SUPERVISOR'
    UNION ALL SELECT 'F0003', 'OPERADOR'
    UNION ALL SELECT 'F0004', 'OPERADOR'
) perfil
LEFT JOIN funcionario f ON f.matricula = perfil.matricula;
COMMIT;

-- Guarde as senhas geradas privadamente. As contas aceitam apenas TCP loopback.
CREATE USER 'supermercado_acad_leitura'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD,
            'supermercado_acad_app'@'127.0.0.1' IDENTIFIED BY RANDOM PASSWORD;

GRANT SELECT, SHOW VIEW ON Supermercado.vw_vendas_finalizadas TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT, SHOW VIEW ON Supermercado.vw_estoque_produtos TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.usuarios TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.grupos_usuarios TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT (id_funcionario, nome, matricula, id_cargo) ON Supermercado.funcionario TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.cargo TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.venda TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.sessao_caixa TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.caixa TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.item_venda TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT (id_item_venda) ON Supermercado.cancelamento_item TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.pagamento TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.produto TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.categoria TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.marca TO 'supermercado_acad_leitura'@'127.0.0.1';
GRANT SELECT ON Supermercado.lote TO 'supermercado_acad_leitura'@'127.0.0.1';

-- Perfil da API alinhado às leituras e gravações do projeto oficial.
-- O cadastro acadêmico cria o vínculo OPERADOR na mesma transação do funcionário.
GRANT INSERT ON Supermercado.usuarios TO 'supermercado_acad_app'@'127.0.0.1';
GRANT SELECT ON Supermercado.* TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.funcionario TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.cargo TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.caixa TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.forma_pagamento TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.categoria TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.marca TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.produto TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.fornecedor TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.produto_fornecedor TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.pedido_compra TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.item_pedido_compra TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.lote TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.sessao_caixa TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.venda TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT, UPDATE ON Supermercado.item_venda TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT ON Supermercado.movimentacao_estoque TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT ON Supermercado.cancelamento_item TO 'supermercado_acad_app'@'127.0.0.1';
GRANT INSERT ON Supermercado.pagamento TO 'supermercado_acad_app'@'127.0.0.1';
