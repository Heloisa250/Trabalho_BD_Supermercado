use Supermercado;
 
-- caixa
insert into caixa (numero, descricao, ativo) values
(1, 'Caixa 01 - Entrada principal', 1),
(2, 'Caixa 02', 1),
(3, 'Caixa 03', 1),
(4, 'Caixa 04 - Preferencial', 1),
(5, 'Caixa 05 - Reserva', 0);

-- cargo
insert into cargo (nome, descricao, pode_cancelar_item) values
('Operador de Caixa', 'Atendimento e registro de vendas no caixa', 0),
('Supervisor de Caixa', 'Supervisiona os caixas e autoriza cancelamentos', 1),
('Gerente', 'Gerência geral da loja', 1),
('Repositor', 'Reposição de produtos nas gôndolas e no estoque', 0),
('Comprador', 'Compras e relacionamento com fornecedores', 0);

-- forma_pagamento
insert into forma_pagamento (descricao, permite_troco, ativo) values
('Dinheiro', 1, 1),
('Cartão de Débito', 0, 1),
('Cartão de Crédito', 0, 1),
('Pix', 0, 1),
('Vale-Alimentação', 0, 1);

-- marca
insert into marca (nome, fabricante) values
('Tio João', 'Josapar'),
('Camil', 'Camil Alimentos S.A.'),
('Coca-Cola', 'Coca-Cola Brasil'),
('Ypê', 'Química Amparo'),
('Piracanjuba', 'Laticínios Bela Vista');

-- categoria 
insert into categoria (id_categoria_pai, nome, descricao) values
(null, 'Alimentos', 'Alimentos em geral'),
(null, 'Bebidas', 'Bebidas em geral'),
(null, 'Limpeza', 'Produtos de limpeza');

insert into categoria (id_categoria_pai, nome, descricao) values
(1, 'Grãos e Cereais', 'Arroz, feijão e similares'),
(2, 'Refrigerantes', 'Refrigerantes e sucos');

-- fornecedor
insert into fornecedor (id_fornecedor, razao_social, nome_fantasia, cnpj, telefone, email, endereco, ativo) values
(1, 'Distribuidora Alimentos Brasil Ltda', 'Alimentos Brasil', '11222333000181', '(11) 3201-1001', 'vendas@alimentosbrasil.com.br', 'Av. das Indústrias, 1200 - Distrito Industrial', 1),
(2, 'Bebidas Central Distribuidora Ltda', 'Bebidas Central', '22333444000172', '(11) 3202-2002', 'pedidos@bebidascentral.com.br', 'Rua das Bebidas, 450 - Centro', 1),
(3, 'Limpeza e Higiene Atacado Ltda', 'LH Atacado', '33444555000163', '(11) 3203-3003', 'contato@lhatacado.com.br', 'Av. Comercial, 880 - Jardim Industrial', 1),
(4, 'Hortifruti Campo Fresco Ltda', 'Campo Fresco', '44555666000154', '(11) 3204-4004', 'vendas@campofresco.com.br', 'Estrada Rural, s/n - Central de Abastecimento', 1),
(5, 'Comercial Nova Esperança Ltda', null, '55666777000145', '(11) 3205-5005', null, 'Rua Esperança, 15 - Centro', 0);

-- funcionario (senha de teste: senha123, guardada com sha2 de 256 bits = 64 caracteres)
insert into funcionario (id_funcionario, id_cargo, nome, cpf, matricula, senha_hash, email, telefone, salario, data_admissao, data_demissao, ativo) values
(1, 3, 'Mariana Souza Lima', '12345678901', 'F0001', sha2('senha123', 256), 'mariana.lima@supermercado.com', '(11) 98888-0001', 6500.00, '2020-03-10', null, 1),
(2, 2, 'Carlos Eduardo Ribeiro', '23456789012', 'F0002', sha2('senha123', 256), 'carlos.ribeiro@supermercado.com', '(11) 98888-0002', 3800.00, '2021-05-17', null, 1),
(3, 1, 'João Pedro Martins', '34567890123', 'F0003', sha2('senha123', 256), 'joao.martins@supermercado.com', '(11) 98888-0003', 2200.00, '2023-02-06', null, 1),
(4, 1, 'Ana Clara Rocha', '45678901234', 'F0004', sha2('senha123', 256), 'ana.rocha@supermercado.com', '(11) 98888-0004', 2200.00, '2023-06-12', null, 1),
(5, 5, 'Juliana Castro', '56789012345', 'F0005', sha2('senha123', 256), 'juliana.castro@supermercado.com', '(11) 98888-0005', 3200.00, '2021-11-03', null, 1);

-- produto
insert into produto (id_produto, codigo_barras, nome, descricao, id_categoria, id_marca, unidade_medida, preco_venda, estoque_minimo, estoque_maximo, ativo) values
(1, '7891234500011', 'Arroz Branco Tipo 1 5kg', 'Pacote de 5kg', 4, 1, 'UN', 28.90, 20.000, 200.000, 1),
(2, '7891234500028', 'Feijão Carioca 1kg', 'Pacote de 1kg', 4, 2, 'UN', 8.49, 30.000, 300.000, 1),
(3, '7891234500035', 'Refrigerante Cola 2L', 'Garrafa PET de 2 litros', 5, 3, 'UN', 9.99, 40.000, 300.000, 1),
(4, '7891234500042', 'Detergente Líquido 500ml', 'Frasco de 500ml', 3, 4, 'UN', 2.79, 50.000, 400.000, 1),
(5, '7891234500059', 'Banana Prata', 'Vendida por quilo', 1, null, 'KG', 6.99, 20.000, 100.000, 1);

-- sessao_caixa
insert into sessao_caixa (id_sessao, id_caixa, id_operador, data_abertura, data_fechamento, fundo_troco, valor_contado) values
(1, 1, 3, '2026-11-03 08:00:00', '2026-11-03 14:00:00', 200.00, 245.88),
(2, 2, 4, '2026-11-04 08:00:00', '2026-11-04 14:00:00', 150.00, 167.77),
(3, 1, 3, '2026-11-06 14:00:00', null, 200.00, null);

-- venda
insert into venda (id_venda, id_sessao, data_hora, valor_total, status) values
(1, 1, '2026-11-03 09:15:00', 45.88, 'FINALIZADA'),
(2, 1, '2026-11-03 11:30:00', 17.11, 'FINALIZADA'),
(3, 2, '2026-11-04 09:00:00', 87.77, 'FINALIZADA'),
(4, 2, '2026-11-04 10:20:00', 19.56, 'CANCELADA'),
(5, 3, '2026-11-06 15:30:00', 38.89, 'ABERTA');

-- item_venda
insert into item_venda (id_item_venda, id_venda, id_produto, quantidade, preco_unitario, subtotal) values
(1, 1, 1, 1.000, 28.90, 28.90),
(2, 1, 2, 2.000, 8.49, 16.98),
(3, 2, 5, 1.250, 6.99, 8.74),
(4, 2, 4, 3.000, 2.79, 8.37),
(5, 3, 3, 3.000, 9.99, 29.97),
(6, 3, 1, 2.000, 28.90, 57.80),
(7, 4, 5, 2.000, 6.99, 13.98),
(8, 4, 4, 2.000, 2.79, 5.58),
(9, 5, 1, 1.000, 28.90, 28.90),
(10, 5, 3, 1.000, 9.99, 9.99);

-- pagamento 
insert into pagamento (id_pagamento, id_venda, id_forma_pagamento, valor, valor_recebido, troco, data_hora) values
(1, 1, 1, 45.88, 50.00, 4.12, '2026-11-03 09:17:00'),
(2, 2, 4, 17.11, 17.11, 0.00, '2026-11-03 11:32:00'),
(3, 3, 1, 17.77, 20.00, 2.23, '2026-11-04 09:03:00'),
(4, 3, 3, 70.00, 70.00, 0.00, '2026-11-04 09:03:00');

-- nota_fiscal 
insert into nota_fiscal (id_nota_fiscal, id_venda, serie, chave_acesso, cpf_consumidor, data_emissao) values
(1, 1, 1, '36314980559125468542850302656093191975151290', null, '2026-11-03 09:17:00'),
(2, 2, 1, '00707029561886719141344478428662637008346706', '11122233396', '2026-11-03 11:32:00'),
(3, 3, 1, '69196815480078337923225818777266193751574538', null, '2026-11-04 09:03:00');

-- pedido_compra
insert into pedido_compra (id_pedido, id_fornecedor, id_funcionario, data_pedido, data_prevista, data_recebimento, status, observacao) values
(1, 1, 5, '2026-10-20 09:00:00', '2026-10-23', '2026-10-23 10:30:00', 'RECEBIDO', 'Reposição mensal de arroz'),
(2, 2, 5, '2026-10-25 14:00:00', '2026-10-29', '2026-10-29 11:00:00', 'RECEBIDO', null),
(3, 3, 5, '2026-10-27 10:00:00', '2026-11-01', '2026-11-01 15:20:00', 'RECEBIDO', null),
(4, 4, 5, '2026-10-30 07:45:00', '2026-11-02', '2026-11-02 07:30:00', 'RECEBIDO', 'Hortifrúti da semana'),
(5, 1, 1, '2026-11-07 11:00:00', '2026-11-12', null, 'ENVIADO', 'Reposição de feijão');

-- produto_fornecedor
insert into produto_fornecedor (id_produto, id_fornecedor, preco_custo, prazo_entrega_dias) values
(1, 1, 22.50, 3),
(2, 1, 6.20, 3),
(3, 2, 7.40, 4),
(4, 3, 1.90, 5),
(5, 4, 4.80, 1);

-- item_pedido_compra
insert into item_pedido_compra (id_pedido, id_produto, quantidade, custo_unitario) values
(1, 1, 100.000, 22.50),
(2, 3, 200.000, 7.40),
(3, 4, 200.000, 1.90),
(4, 5, 50.000, 4.80),
(5, 2, 100.000, 6.20);

-- lote 
insert into lote (id_lote, id_produto, id_pedido, codigo_lote, data_fabricacao, data_validade, data_entrada, quantidade_inicial, quantidade_atual, custo_unitario) values
(1, 1, 1, 'ARZ-2610-A', '2026-09-15', '2027-09-15', '2026-10-23 10:30:00', 100.000, 97.000, 22.50),
(2, 2, null, 'EST-INI-FJC', '2026-06-01', '2027-06-01', '2026-10-01 08:00:00', 40.000, 38.000, 5.90),
(3, 3, 2, 'REF-2610-A', '2026-10-05', '2027-04-05', '2026-10-29 11:00:00', 200.000, 197.000, 7.40),
(4, 4, 3, 'DET-2610-A', '2026-08-20', '2028-08-20', '2026-11-01 15:20:00', 200.000, 197.000, 1.90),
(5, 5, 4, 'BAN-1102', null, '2026-11-09', '2026-11-02 07:30:00', 50.000, 48.750, 4.80);

-- movimentacao_estoque
insert into movimentacao_estoque (id_movimentacao, id_lote, id_item_venda, id_funcionario, tipo, quantidade, data_hora, observacao) values
(1, 2, null, 5, 'ENTRADA', 40.000, '2026-10-01 08:00:00', 'Estoque inicial'),
(2, 1, null, 5, 'ENTRADA', 100.000, '2026-10-23 10:30:00', 'Recebimento do pedido 1'),
(3, 3, null, 5, 'ENTRADA', 200.000, '2026-10-29 11:00:00', 'Recebimento do pedido 2'),
(4, 4, null, 5, 'ENTRADA', 200.000, '2026-11-01 15:20:00', 'Recebimento do pedido 3'),
(5, 5, null, 5, 'ENTRADA', 50.000, '2026-11-02 07:30:00', 'Recebimento do pedido 4'),
(6, 1, 1, null, 'SAIDA_VENDA', 1.000, '2026-11-03 09:15:00', null),
(7, 2, 2, null, 'SAIDA_VENDA', 2.000, '2026-11-03 09:15:00', null),
(8, 5, 3, null, 'SAIDA_VENDA', 1.250, '2026-11-03 11:30:00', null),
(9, 4, 4, null, 'SAIDA_VENDA', 3.000, '2026-11-03 11:30:00', null),
(10, 3, 5, null, 'SAIDA_VENDA', 3.000, '2026-11-04 09:00:00', null),
(11, 1, 6, null, 'SAIDA_VENDA', 2.000, '2026-11-04 09:00:00', null);

-- cancelamento_item
insert into cancelamento_item (id_cancelamento, id_item_venda, id_supervisor, data_hora, motivo) values
(1, 7, 2, '2026-11-04 10:25:00', 'Cliente desistiu da compra'),
(2, 8, 2, '2026-11-04 10:25:00', 'Cliente desistiu da compra');