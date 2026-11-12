create database if not exists Supermercado;
use Supermercado;

-- Tabelas sem chave estrangeira
create table caixa(
id_caixa int auto_increment primary key,
numero smallint not null unique,
descricao varchar(60),
ativo tinyint not null
);

create table cargo(
id_cargo int auto_increment primary key,
nome varchar(50) not null,
descricao varchar(255),
pode_cancelar_item tinyint not null
);

create table forma_pagamento(
id_forma_pagamento int auto_increment primary key,
descricao varchar(40) not null,
permite_troco tinyint not null,
ativo tinyint not null
);

create table marca(
id_marca int auto_increment primary key,
nome varchar(60) not null,
fabricante varchar(100)
);

create table fornecedor(
id_fornecedor int primary key,
razao_social varchar(120) not null,
nome_fantasia varchar(120), -- valor cortado no der
cnpj char(14) unique not null,
telefone varchar(20),
email varchar(100),
endereco varchar(200),
ativo tinyint not null
);

create table categoria(
id_categoria int auto_increment primary key,
id_categoria_pai int,
nome varchar(60) not null,
descricao varchar(255),
constraint fk_categoria_pai
foreign key (id_categoria_pai) references categoria(id_categoria)
);

-- Tabelas com fk
create table funcionario(
id_funcionario int primary key,
id_cargo int not null,
nome varchar(100) not null,
cpf char(11) unique not null, 
matricula varchar(20) unique not null, -- valor cortado no der
senha_hash char(64) not null,
email varchar(100),
telefone varchar(20),
salario decimal(10,2) not null,
data_admissao date not null,
data_demissao date,
ativo tinyint not null,
constraint fk_funcionario_cargo foreign key (id_cargo) references cargo(id_cargo)
);

create table produto(
id_produto int primary key,
codigo_barras varchar(14) unique not null,
nome varchar(120) not null,
descricao varchar (255),
id_categoria int not null,
id_marca int,
unidade_medida enum('UN','KG', 'L') not null, -- valor cortado no der
preco_venda decimal(10,2) not null,
estoque_minimo decimal(10,3) not null,
estoque_maximo decimal(10,3) not null, -- valor cortado no der
ativo tinyint not null,
constraint fk_produto_categoria foreign key (id_categoria) references categoria(id_categoria),
constraint fk_produto_marca foreign key (id_marca) references marca(id_marca)
);

create table sessao_caixa(
id_sessao int primary key,
id_caixa int not null,
id_operador int not null,
data_abertura datetime not null,
data_fechamento datetime,
fundo_troco decimal(10,2) not null,
valor_contado decimal(10,2), -- valor cortado no der
constraint fk_sessao_caixa_caixa
foreign key (id_caixa) references caixa(id_caixa),
constraint fk_sessao_caixa_funcionario
foreign key (id_operador) references funcionario(id_funcionario)
);

-- Bloco Vendas
create table venda(
id_venda int primary key,
id_sessao int not null,
data_hora datetime not null,
valor_total decimal (10,2) not null, -- valor cortado no der
status enum ('ABERTA','FINALIZADA','CANCELADA') not null,
constraint fk_venda_sessao 
foreign key (id_sessao) references sessao_caixa (id_sessao)
);

create table item_venda(
id_item_venda int primary key,
id_venda int not null,
id_produto int not null,
quantidade decimal (10,3) not null,
preco_unitario decimal(10,2) not null, -- valor cortado no der
subtotal decimal(10,2),
constraint fk_item_venda_venda
foreign key (id_venda) references venda(id_venda), 
constraint fk_item_venda_produto 
foreign key (id_produto) references produto(id_produto)
);

create table pagamento(
id_pagamento int primary key,
id_venda int not null,
id_forma_pagamento int not null,
valor decimal(10,2) not null,
valor_recebido decimal (10,2), -- valor cortado no der
troco decimal(10,2),
data_hora datetime not null,
constraint fk_pagamento_forma_pagamento
foreign key (id_forma_pagamento) references forma_pagamento(id_forma_pagamento),
constraint fk_pagamento_venda
foreign key (id_venda) references venda(id_venda)
);

create table nota_fiscal(
id_nota_fiscal int primary key,
id_venda int not null,
serie smallint not null,
chave_acesso char(44) unique,
cpf_consumidor char(11),
data_emissao datetime not null,
constraint fk_nota_fiscal_venda
foreign key (id_venda) references venda(id_venda)
);

-- Bloco Compras
create table pedido_compra(
id_pedido int primary key,
id_fornecedor int not null,
id_funcionario int not null,
data_pedido datetime not null,
data_prevista date,
data_recebimento datetime,
status enum('PENDENTE','ENVIADO','RECEBIDO','CANCELADO') not null,
observacao varchar(255),
constraint fk_pedido_compra_fornecedor
foreign key (id_fornecedor) references fornecedor (id_fornecedor),
constraint fk_pedido_compra_funcionario
foreign key (id_funcionario) references funcionario(id_funcionario)
);

create table produto_fornecedor(
id_produto int not null,
id_fornecedor int not null,
preco_custo decimal(10,2) not null,
prazo_entrega_dias smallint,
primary key (id_produto, id_fornecedor),
constraint fk_produto_fornecedor_produto 
foreign key (id_produto) references produto(id_produto),
constraint fk_produto_fornecedor_fornecedor 
foreign key (id_fornecedor) references fornecedor(id_fornecedor)
);

create table item_pedido_compra(
id_pedido int not null,
id_produto int not null,
quantidade decimal(10,3) not null,
custo_unitario decimal(10,2) not null,
primary key (id_pedido, id_produto),
constraint fk_item_pedido_compra_pedido_compra
foreign key (id_pedido) references pedido_compra(id_pedido),
constraint fk_item_pedido_compra_produto
foreign key (id_produto) references produto(id_produto)
);

-- Bloco Estoque
create table lote(
id_lote int primary key,
id_produto int not null,
id_pedido int,
codigo_lote varchar(30) not null,
data_fabricacao date,
data_validade date,
data_entrada datetime not null,
quantidade_inicial decimal(10,3) not null, -- tamanho cortado no der
quantidade_atual decimal(10,3) not null,
custo_unitario decimal(10,2) not null,
constraint uq_lote_produto_codigo unique (id_produto, codigo_lote),
constraint fk_lote_produto
foreign key (id_produto) references produto(id_produto),
constraint fk_lote_item_pedido_compra
foreign key (id_pedido, id_produto) references item_pedido_compra(id_pedido, id_produto)
);

create table movimentacao_estoque(
id_movimentacao int primary key,
id_lote int not null,
id_item_venda int,
id_funcionario int,
tipo enum('ENTRADA','SAIDA_VENDA','AJUSTE','PERDA') not null, 
quantidade decimal(10,3) not null,
data_hora datetime not null,
observacao varchar(255),
constraint fk_movimentacao_estoque_lote
foreign key (id_lote) references lote(id_lote),
constraint fk_movimentacao_estoque_item_venda
foreign key (id_item_venda) references item_venda(id_item_venda),
constraint fk_movimentacao_estoque_funcionario
foreign key (id_funcionario) references funcionario(id_funcionario)
);

create table cancelamento_item(
id_cancelamento int primary key,
id_item_venda int not null,
id_supervisor int not null,
data_hora datetime not null,
motivo varchar(255) not null,
constraint fk_cancelamento_item_item_venda
foreign key (id_item_venda) references item_venda(id_item_venda),
constraint fk_cancelamento_item_funcionario
foreign key (id_supervisor) references funcionario(id_funcionario)
);