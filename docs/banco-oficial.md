# Banco oficial do Supermercado Qualidade Líder

Fonte: [Trabalho_BD_Supermercado no commit 4bb569c5f22dcdcb3cf05ba47a6839f6367bb157](https://github.com/Heloisa250/Trabalho_BD_Supermercado/tree/4bb569c5f22dcdcb3cf05ba47a6839f6367bb157). As cópias em `database/official/` foram extraídas do arquivo Git do commit, preservando os bytes.

| Arquivo | SHA-256 |
| --- | --- |
| Supermercado_ddl.sql | `d5227f6e5259da79f157d88b79a9d44df437025e3ba99357a754924c603c1308` |
| Supermercado_dml.sql | `0da3145472fdfa9f13ed89c467045d04c66db8027dd0691dbf6638a215960cd8` |
| Supermercado_testes.sql | `c2c2e51c087a42449e91f9afc694a3b007d785c2fd3db694629c2f1a927f944b` |
| Justificativa_auto_increment.txt | `1bd21f042d5b95798c23673e766c7a886eff839456da05dc1be1f9f5589748fd` |

O DDL cria `Supermercado`, com 19 tabelas e 25 FKs. Não declara charset, collation, engine, defaults explícitos ou colunas geradas. Campos sem `NOT NULL` ou PK admitem NULL. Chaves primárias são obrigatórias. Os cadastros de apoio caixa, cargo, forma de pagamento, marca e categoria usam AUTO_INCREMENT. Os demais IDs simples são explícitos. As duas associações têm chave composta.

## Dicionário do DDL

### caixa

- `id_caixa int auto_increment primary key`
- `numero smallint not null unique`
- `descricao varchar(60)`
- `ativo tinyint not null`

### cargo

- `id_cargo int auto_increment primary key`
- `nome varchar(50) not null`
- `descricao varchar(255)`
- `pode_cancelar_item tinyint not null`

### forma_pagamento

- `id_forma_pagamento int auto_increment primary key`
- `descricao varchar(40) not null`
- `permite_troco tinyint not null`
- `ativo tinyint not null`

### marca

- `id_marca int auto_increment primary key`
- `nome varchar(60) not null`
- `fabricante varchar(100)`

### fornecedor

- `id_fornecedor int primary key`
- `razao_social varchar(120) not null`
- `nome_fantasia varchar(120)`
- `cnpj char(14) unique not null`
- `telefone varchar(20)`
- `email varchar(100)`
- `endereco varchar(200)`
- `ativo tinyint not null`

### categoria

- `id_categoria int auto_increment primary key`
- `id_categoria_pai int`
- `nome varchar(60) not null`
- `descricao varchar(255)`

Restrições de tabela

- `constraint fk_categoria_pai foreign key (id_categoria_pai) references categoria(id_categoria)`

### funcionario

- `id_funcionario int primary key`
- `id_cargo int not null`
- `nome varchar(100) not null`
- `cpf char(11) unique not null`
- `matricula varchar(20) unique not null`
- `senha_hash char(64) not null`
- `email varchar(100)`
- `telefone varchar(20)`
- `salario decimal(10,2) not null`
- `data_admissao date not null`
- `data_demissao date`
- `ativo tinyint not null`

Restrições de tabela

- `constraint fk_funcionario_cargo foreign key (id_cargo) references cargo(id_cargo)`

### produto

- `id_produto int primary key`
- `codigo_barras varchar(14) unique not null`
- `nome varchar(120) not null`
- `descricao varchar (255)`
- `id_categoria int not null`
- `id_marca int`
- `unidade_medida enum('UN','KG', 'L') not null`
- `preco_venda decimal(10,2) not null`
- `estoque_minimo decimal(10,3) not null`
- `estoque_maximo decimal(10,3) not null`
- `ativo tinyint not null`

Restrições de tabela

- `constraint fk_produto_categoria foreign key (id_categoria) references categoria(id_categoria)`
- `constraint fk_produto_marca foreign key (id_marca) references marca(id_marca)`

### sessao_caixa

- `id_sessao int primary key`
- `id_caixa int not null`
- `id_operador int not null`
- `data_abertura datetime not null`
- `data_fechamento datetime`
- `fundo_troco decimal(10,2) not null`
- `valor_contado decimal(10,2)`

Restrições de tabela

- `constraint fk_sessao_caixa_caixa foreign key (id_caixa) references caixa(id_caixa)`
- `constraint fk_sessao_caixa_funcionario foreign key (id_operador) references funcionario(id_funcionario)`

### venda

- `id_venda int primary key`
- `id_sessao int not null`
- `data_hora datetime not null`
- `valor_total decimal (10,2) not null`
- `status enum ('ABERTA','FINALIZADA','CANCELADA') not null`

Restrições de tabela

- `constraint fk_venda_sessao foreign key (id_sessao) references sessao_caixa (id_sessao)`

### item_venda

- `id_item_venda int primary key`
- `id_venda int not null`
- `id_produto int not null`
- `quantidade decimal (10,3) not null`
- `preco_unitario decimal(10,2) not null`
- `subtotal decimal(10,2)`

Restrições de tabela

- `constraint fk_item_venda_venda foreign key (id_venda) references venda(id_venda)`
- `constraint fk_item_venda_produto foreign key (id_produto) references produto(id_produto)`

### pagamento

- `id_pagamento int primary key`
- `id_venda int not null`
- `id_forma_pagamento int not null`
- `valor decimal(10,2) not null`
- `valor_recebido decimal (10,2)`
- `troco decimal(10,2)`
- `data_hora datetime not null`

Restrições de tabela

- `constraint fk_pagamento_forma_pagamento foreign key (id_forma_pagamento) references forma_pagamento(id_forma_pagamento)`
- `constraint fk_pagamento_venda foreign key (id_venda) references venda(id_venda)`

### nota_fiscal

- `id_nota_fiscal int primary key`
- `id_venda int not null`
- `serie smallint not null`
- `chave_acesso char(44) unique`
- `cpf_consumidor char(11)`
- `data_emissao datetime not null`

Restrições de tabela

- `constraint fk_nota_fiscal_venda foreign key (id_venda) references venda(id_venda)`

### pedido_compra

- `id_pedido int primary key`
- `id_fornecedor int not null`
- `id_funcionario int not null`
- `data_pedido datetime not null`
- `data_prevista date`
- `data_recebimento datetime`
- `status enum('PENDENTE','ENVIADO','RECEBIDO','CANCELADO') not null`
- `observacao varchar(255)`

Restrições de tabela

- `constraint fk_pedido_compra_fornecedor foreign key (id_fornecedor) references fornecedor (id_fornecedor)`
- `constraint fk_pedido_compra_funcionario foreign key (id_funcionario) references funcionario(id_funcionario)`

### produto_fornecedor

- `id_produto int not null`
- `id_fornecedor int not null`
- `preco_custo decimal(10,2) not null`
- `prazo_entrega_dias smallint`

Restrições de tabela

- `primary key (id_produto, id_fornecedor)`
- `constraint fk_produto_fornecedor_produto foreign key (id_produto) references produto(id_produto)`
- `constraint fk_produto_fornecedor_fornecedor foreign key (id_fornecedor) references fornecedor(id_fornecedor)`

### item_pedido_compra

- `id_pedido int not null`
- `id_produto int not null`
- `quantidade decimal(10,3) not null`
- `custo_unitario decimal(10,2) not null`

Restrições de tabela

- `primary key (id_pedido, id_produto)`
- `constraint fk_item_pedido_compra_pedido_compra foreign key (id_pedido) references pedido_compra(id_pedido)`
- `constraint fk_item_pedido_compra_produto foreign key (id_produto) references produto(id_produto)`

### lote

- `id_lote int primary key`
- `id_produto int not null`
- `id_pedido int`
- `codigo_lote varchar(30) not null`
- `data_fabricacao date`
- `data_validade date`
- `data_entrada datetime not null`
- `quantidade_inicial decimal(10,3) not null`
- `quantidade_atual decimal(10,3) not null`
- `custo_unitario decimal(10,2) not null`

Restrições de tabela

- `constraint uq_lote_produto_codigo unique (id_produto, codigo_lote)`
- `constraint fk_lote_produto foreign key (id_produto) references produto(id_produto)`
- `constraint fk_lote_item_pedido_compra foreign key (id_pedido, id_produto) references item_pedido_compra(id_pedido, id_produto)`

### movimentacao_estoque

- `id_movimentacao int primary key`
- `id_lote int not null`
- `id_item_venda int`
- `id_funcionario int`
- `tipo enum('ENTRADA','SAIDA_VENDA','AJUSTE','PERDA') not null`
- `quantidade decimal(10,3) not null`
- `data_hora datetime not null`
- `observacao varchar(255)`

Restrições de tabela

- `constraint fk_movimentacao_estoque_lote foreign key (id_lote) references lote(id_lote)`
- `constraint fk_movimentacao_estoque_item_venda foreign key (id_item_venda) references item_venda(id_item_venda)`
- `constraint fk_movimentacao_estoque_funcionario foreign key (id_funcionario) references funcionario(id_funcionario)`

### cancelamento_item

- `id_cancelamento int primary key`
- `id_item_venda int not null`
- `id_supervisor int not null`
- `data_hora datetime not null`
- `motivo varchar(255) not null`

Restrições de tabela

- `constraint fk_cancelamento_item_item_venda foreign key (id_item_venda) references item_venda(id_item_venda)`
- `constraint fk_cancelamento_item_funcionario foreign key (id_supervisor) references funcionario(id_funcionario)`

## Dependências

- Comece por caixa, cargo, forma de pagamento, marca, fornecedor e categorias raiz. Cadastre categorias filhas depois do pai. Funcionário depende de cargo e produto depende de categoria e, opcionalmente, marca.
- Sessão depende de caixa e funcionário. Venda depende de sessão. Item de venda depende de venda e produto. Pagamento depende de venda e forma. Nota depende de venda. Cancelamento depende de item e supervisor.
- Pedido depende de fornecedor e funcionário. Vínculo comercial depende de produto e fornecedor. Item de pedido depende de pedido e produto. Lote depende de produto e, se houver pedido, do par pedido-produto. Movimento depende de lote e pode referenciar funcionário e item de venda.
- Ao atualizar uma FK, o novo pai precisa existir. Nenhuma FK declara cascata. A exclusão física de pais referenciados é restrita. Preserve histórico. A desativação lógica existe somente onde há `ativo`.
- O relacionamento de categoria aceita uma hierarquia cíclica em SQL. A aplicação precisa impedir ciclos. O mesmo princípio vale para a permissão do supervisor e a compatibilidade do produto entre movimento, lote e item de venda.

O arquivo `sqlSupermercado2.sql` serve como referência histórica da primeira implementação.
