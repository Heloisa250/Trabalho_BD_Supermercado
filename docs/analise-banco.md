> Documento do ambiente legado. Para o schema oficial, consulte [Banco oficial](banco-oficial.md).

# Auditoria do banco

Fontes lidas integralmente em 09/11/2026. O SQL estava em Downloads e o TXT na raiz da Área de Trabalho.

- SQL original: `sqlSupermercado2.sql`
- SHA-256: `852f952239a8a096f99e3da0964c503099799fab483b47b301cf96386c3b734a`
- Especificação: `supermercado qualidade líder.txt`

A auditoria é estática. O script define `supermercado` com `utf8mb4` e `utf8mb4_unicode_ci` e contém 19 tabelas InnoDB. `mydb` aparece apenas em comentário. O script salva, altera temporariamente e restaura SQL mode e verificações de FK e UNIQUE na sessão de importação. A aplicação deve operar com as verificações habilitadas e validar o modo estrito na base provisionada. O arquivo contém DDL de schema, tabelas e índices declarados nas tabelas. Não há dados iniciais, CHECK explícito, procedimentos, funções armazenadas, triggers, views ou comandos de criação de usuários e concessão de privilégios.

## Dicionário

As definições reproduzem nulabilidade, defaults explícitos e expressões. Colunas obrigatórias sem default devem ser preenchidas em INSERT, exceto as chaves auto-incrementadas e as colunas geradas. Omitir as colunas geradas nas escritas. Os índices abaixo são os declarados, com direção ascendente e visibilidade padrão omitidas da representação.

### `cargo`

| Coluna | Definição |
| --- | --- |
| `id_cargo` | `INT NOT NULL AUTO_INCREMENT` |
| `nome` | `VARCHAR(50) NOT NULL` |
| `descricao` | `VARCHAR(255) NULL DEFAULT NULL` |
| `pode_cancelar_item` | `TINYINT NOT NULL DEFAULT FALSE` |

- `PRIMARY KEY (id_cargo)`
- `UNIQUE INDEX uq_cargo_nome (nome)`

### `funcionario`

| Coluna | Definição |
| --- | --- |
| `id_funcionario` | `INT NOT NULL AUTO_INCREMENT` |
| `id_cargo` | `INT NOT NULL` |
| `nome` | `VARCHAR(100) NOT NULL` |
| `cpf` | `CHAR(11) NOT NULL` |
| `matricula` | `VARCHAR(20) NOT NULL` |
| `senha_hash` | `CHAR(64) NOT NULL` |
| `email` | `VARCHAR(100) NULL DEFAULT NULL` |
| `telefone` | `VARCHAR(20) NULL DEFAULT NULL` |
| `salario` | `DECIMAL(10,2) NOT NULL` |
| `data_admissao` | `DATE NOT NULL` |
| `data_demissao` | `DATE NULL DEFAULT NULL` |
| `ativo` | `TINYINT NOT NULL DEFAULT TRUE` |

- `PRIMARY KEY (id_funcionario)`
- `UNIQUE INDEX uq_funcionario_cpf (cpf)`
- `UNIQUE INDEX uq_funcionario_matricula (matricula)`
- `INDEX fk_funcionario_cargo (id_cargo)`
- `CONSTRAINT fk_funcionario_cargo FOREIGN KEY (id_cargo) REFERENCES cargo (id_cargo)`

### `caixa`

| Coluna | Definição |
| --- | --- |
| `id_caixa` | `INT NOT NULL AUTO_INCREMENT` |
| `numero` | `SMALLINT NOT NULL` |
| `descricao` | `VARCHAR(60) NULL DEFAULT NULL` |
| `ativo` | `TINYINT NOT NULL DEFAULT TRUE` |

- `PRIMARY KEY (id_caixa)`
- `UNIQUE INDEX uq_caixa_numero (numero)`

### `sessao_caixa`

| Coluna | Definição |
| --- | --- |
| `id_sessao` | `INT NOT NULL AUTO_INCREMENT` |
| `id_caixa` | `INT NOT NULL` |
| `id_operador` | `INT NOT NULL` |
| `data_abertura` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `data_fechamento` | `DATETIME NULL DEFAULT NULL` |
| `fundo_troco` | `DECIMAL(10,2) NOT NULL DEFAULT 0.00` |
| `valor_contado` | `DECIMAL(10,2) NULL DEFAULT NULL` |

- `PRIMARY KEY (id_sessao)`
- `INDEX fk_sessao_caixa (id_caixa)`
- `INDEX fk_sessao_operador (id_operador)`
- `CONSTRAINT fk_sessao_caixa FOREIGN KEY (id_caixa) REFERENCES caixa (id_caixa)`
- `CONSTRAINT fk_sessao_operador FOREIGN KEY (id_operador) REFERENCES funcionario (id_funcionario)`

### `categoria`

| Coluna | Definição |
| --- | --- |
| `id_categoria` | `INT NOT NULL AUTO_INCREMENT` |
| `id_categoria_pai` | `INT NULL DEFAULT NULL` |
| `nome` | `VARCHAR(60) NOT NULL` |
| `descricao` | `VARCHAR(255) NULL DEFAULT NULL` |

- `PRIMARY KEY (id_categoria)`
- `UNIQUE INDEX uq_categoria_nome (nome)`
- `INDEX fk_categoria_pai (id_categoria_pai)`
- `CONSTRAINT fk_categoria_pai FOREIGN KEY (id_categoria_pai) REFERENCES categoria (id_categoria)`

### `marca`

| Coluna | Definição |
| --- | --- |
| `id_marca` | `INT NOT NULL AUTO_INCREMENT` |
| `nome` | `VARCHAR(60) NOT NULL` |
| `fabricante` | `VARCHAR(100) NULL DEFAULT NULL` |

- `PRIMARY KEY (id_marca)`
- `UNIQUE INDEX uq_marca_nome (nome)`

### `produto`

| Coluna | Definição |
| --- | --- |
| `id_produto` | `INT NOT NULL AUTO_INCREMENT` |
| `codigo_barras` | `VARCHAR(14) NOT NULL` |
| `nome` | `VARCHAR(120) NOT NULL` |
| `descricao` | `VARCHAR(255) NULL DEFAULT NULL` |
| `id_categoria` | `INT NOT NULL` |
| `id_marca` | `INT NULL DEFAULT NULL` |
| `unidade_medida` | `ENUM('UN', 'KG', 'L', 'CX', 'PCT') NOT NULL DEFAULT 'UN'` |
| `preco_venda` | `DECIMAL(10,2) NOT NULL` |
| `estoque_minimo` | `DECIMAL(10,3) NOT NULL DEFAULT 0` |
| `estoque_maximo` | `DECIMAL(10,3) NOT NULL DEFAULT 0` |
| `ativo` | `TINYINT NOT NULL DEFAULT TRUE` |

- `PRIMARY KEY (id_produto)`
- `UNIQUE INDEX uq_produto_codigo_barras (codigo_barras)`
- `INDEX idx_produto_nome (nome)`
- `INDEX fk_produto_categoria (id_categoria)`
- `INDEX fk_produto_marca (id_marca)`
- `CONSTRAINT fk_produto_categoria FOREIGN KEY (id_categoria) REFERENCES categoria (id_categoria)`
- `CONSTRAINT fk_produto_marca FOREIGN KEY (id_marca) REFERENCES marca (id_marca)`

### `fornecedor`

| Coluna | Definição |
| --- | --- |
| `id_fornecedor` | `INT NOT NULL AUTO_INCREMENT` |
| `razao_social` | `VARCHAR(120) NOT NULL` |
| `nome_fantasia` | `VARCHAR(120) NULL DEFAULT NULL` |
| `cnpj` | `CHAR(14) NOT NULL` |
| `telefone` | `VARCHAR(20) NULL DEFAULT NULL` |
| `email` | `VARCHAR(100) NULL DEFAULT NULL` |
| `endereco` | `VARCHAR(200) NULL DEFAULT NULL` |
| `ativo` | `TINYINT NOT NULL DEFAULT TRUE` |

- `PRIMARY KEY (id_fornecedor)`
- `UNIQUE INDEX uq_fornecedor_cnpj (cnpj)`

### `produto_fornecedor`

| Coluna | Definição |
| --- | --- |
| `id_produto` | `INT NOT NULL` |
| `id_fornecedor` | `INT NOT NULL` |
| `preco_custo` | `DECIMAL(10,2) NOT NULL` |
| `prazo_entrega_dias` | `SMALLINT NULL DEFAULT NULL` |

- `PRIMARY KEY (id_produto, id_fornecedor)`
- `INDEX fk_pf_fornecedor (id_fornecedor)`
- `CONSTRAINT fk_pf_produto FOREIGN KEY (id_produto) REFERENCES produto (id_produto)`
- `CONSTRAINT fk_pf_fornecedor FOREIGN KEY (id_fornecedor) REFERENCES fornecedor (id_fornecedor)`

### `pedido_compra`

| Coluna | Definição |
| --- | --- |
| `id_pedido` | `INT NOT NULL AUTO_INCREMENT` |
| `id_fornecedor` | `INT NOT NULL` |
| `id_funcionario` | `INT NOT NULL` |
| `data_pedido` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `data_prevista` | `DATE NULL DEFAULT NULL` |
| `data_recebimento` | `DATETIME NULL DEFAULT NULL` |
| `status` | `ENUM('ABERTO', 'ENVIADO', 'RECEBIDO', 'CANCELADO') NOT NULL DEFAULT 'ABERTO'` |
| `observacao` | `VARCHAR(255) NULL DEFAULT NULL` |

- `PRIMARY KEY (id_pedido)`
- `INDEX fk_pedido_fornecedor (id_fornecedor)`
- `INDEX fk_pedido_funcionario (id_funcionario)`
- `CONSTRAINT fk_pedido_fornecedor FOREIGN KEY (id_fornecedor) REFERENCES fornecedor (id_fornecedor)`
- `CONSTRAINT fk_pedido_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionario (id_funcionario)`

### `item_pedido_compra`

| Coluna | Definição |
| --- | --- |
| `id_pedido` | `INT NOT NULL` |
| `id_produto` | `INT NOT NULL` |
| `quantidade` | `DECIMAL(10,3) NOT NULL` |
| `custo_unitario` | `DECIMAL(10,2) NOT NULL` |

- `PRIMARY KEY (id_pedido, id_produto)`
- `INDEX fk_ipc_produto (id_produto)`
- `CONSTRAINT fk_ipc_pedido FOREIGN KEY (id_pedido) REFERENCES pedido_compra (id_pedido)`
- `CONSTRAINT fk_ipc_produto FOREIGN KEY (id_produto) REFERENCES produto (id_produto)`

### `forma_pagamento`

| Coluna | Definição |
| --- | --- |
| `id_forma_pagamento` | `INT NOT NULL AUTO_INCREMENT` |
| `descricao` | `VARCHAR(40) NOT NULL` |
| `permite_troco` | `TINYINT NOT NULL DEFAULT FALSE` |
| `ativo` | `TINYINT NOT NULL DEFAULT TRUE` |

- `PRIMARY KEY (id_forma_pagamento)`
- `UNIQUE INDEX uq_forma_pagamento (descricao)`

### `venda`

| Coluna | Definição |
| --- | --- |
| `id_venda` | `INT NOT NULL AUTO_INCREMENT` |
| `id_sessao` | `INT NOT NULL` |
| `data_hora` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `valor_total` | `DECIMAL(10,2) NOT NULL DEFAULT 0.00` |
| `status` | `ENUM('ABERTA', 'FINALIZADA', 'CANCELADA') NOT NULL DEFAULT 'ABERTA'` |

- `PRIMARY KEY (id_venda)`
- `INDEX idx_venda_data_hora (data_hora)`
- `INDEX fk_venda_sessao (id_sessao)`
- `CONSTRAINT fk_venda_sessao FOREIGN KEY (id_sessao) REFERENCES sessao_caixa (id_sessao)`

### `item_venda`

| Coluna | Definição |
| --- | --- |
| `id_item_venda` | `INT NOT NULL AUTO_INCREMENT` |
| `id_venda` | `INT NOT NULL` |
| `id_produto` | `INT NOT NULL` |
| `quantidade` | `DECIMAL(10,3) NOT NULL` |
| `preco_unitario` | `DECIMAL(10,2) NOT NULL DEFAULT 0` |
| `subtotal` | `DECIMAL(10,2) GENERATED ALWAYS AS (ROUND(quantidade * preco_unitario, 2)) STORED` |

- `PRIMARY KEY (id_item_venda)`
- `INDEX fk_item_venda_venda (id_venda)`
- `INDEX fk_item_venda_produto (id_produto)`
- `CONSTRAINT fk_item_venda_venda FOREIGN KEY (id_venda) REFERENCES venda (id_venda)`
- `CONSTRAINT fk_item_venda_produto FOREIGN KEY (id_produto) REFERENCES produto (id_produto)`

### `cancelamento_item`

| Coluna | Definição |
| --- | --- |
| `id_cancelamento` | `INT NOT NULL AUTO_INCREMENT` |
| `id_item_venda` | `INT NOT NULL` |
| `id_supervisor` | `INT NOT NULL` |
| `data_hora` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `motivo` | `VARCHAR(255) NOT NULL` |

- `PRIMARY KEY (id_cancelamento)`
- `UNIQUE INDEX uq_cancelamento_item (id_item_venda)`
- `INDEX fk_cancelamento_supervisor (id_supervisor)`
- `CONSTRAINT fk_cancelamento_item FOREIGN KEY (id_item_venda) REFERENCES item_venda (id_item_venda)`
- `CONSTRAINT fk_cancelamento_supervisor FOREIGN KEY (id_supervisor) REFERENCES funcionario (id_funcionario)`

### `pagamento`

| Coluna | Definição |
| --- | --- |
| `id_pagamento` | `INT NOT NULL AUTO_INCREMENT` |
| `id_venda` | `INT NOT NULL` |
| `id_forma_pagamento` | `INT NOT NULL` |
| `valor` | `DECIMAL(10,2) NOT NULL DEFAULT 0` |
| `valor_recebido` | `DECIMAL(10,2) NULL DEFAULT NULL` |
| `troco` | `DECIMAL(10,2) GENERATED ALWAYS AS (COALESCE(valor_recebido, valor) - valor) STORED` |
| `data_hora` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` |

- `PRIMARY KEY (id_pagamento)`
- `INDEX fk_pagamento_venda (id_venda)`
- `INDEX fk_pagamento_forma (id_forma_pagamento)`
- `CONSTRAINT fk_pagamento_venda FOREIGN KEY (id_venda) REFERENCES venda (id_venda)`
- `CONSTRAINT fk_pagamento_forma FOREIGN KEY (id_forma_pagamento) REFERENCES forma_pagamento (id_forma_pagamento)`

### `nota_fiscal`

| Coluna | Definição |
| --- | --- |
| `id_nota_fiscal` | `INT NOT NULL AUTO_INCREMENT` |
| `id_venda` | `INT NOT NULL` |
| `serie` | `SMALLINT NOT NULL DEFAULT 1` |
| `chave_acesso` | `CHAR(44) NULL DEFAULT NULL` |
| `cpf_consumidor` | `CHAR(11) NULL DEFAULT NULL` |
| `data_emissao` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` |

- `PRIMARY KEY (id_nota_fiscal)`
- `UNIQUE INDEX uq_nota_fiscal_venda (id_venda)`
- `UNIQUE INDEX uq_nota_fiscal_chave (chave_acesso)`
- `CONSTRAINT fk_nota_fiscal_venda FOREIGN KEY (id_venda) REFERENCES venda (id_venda)`

### `lote`

| Coluna | Definição |
| --- | --- |
| `id_lote` | `INT NOT NULL AUTO_INCREMENT` |
| `id_produto` | `INT NOT NULL` |
| `id_pedido` | `INT NULL DEFAULT NULL` |
| `codigo_lote` | `VARCHAR(30) NOT NULL` |
| `data_fabricacao` | `DATE NULL DEFAULT NULL` |
| `data_validade` | `DATE NULL DEFAULT NULL` |
| `data_entrada` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `quantidade_inicial` | `DECIMAL(10,3) NOT NULL` |
| `quantidade_atual` | `DECIMAL(10,3) NOT NULL DEFAULT 0` |
| `custo_unitario` | `DECIMAL(10,2) NOT NULL` |

- `PRIMARY KEY (id_lote)`
- `INDEX idx_lote_fefo (id_produto, data_validade)`
- `INDEX fk_lote_produto (id_produto)`
- `INDEX fk_lote_item_pedido (id_pedido, id_produto)`
- `CONSTRAINT fk_lote_produto FOREIGN KEY (id_produto) REFERENCES produto (id_produto)`
- `CONSTRAINT fk_lote_item_pedido FOREIGN KEY (id_pedido , id_produto) REFERENCES item_pedido_compra (id_pedido , id_produto)`

### `movimentacao_estoque`

| Coluna | Definição |
| --- | --- |
| `id_movimentacao` | `INT NOT NULL AUTO_INCREMENT` |
| `id_lote` | `INT NOT NULL` |
| `id_item_venda` | `INT NULL DEFAULT NULL` |
| `id_funcionario` | `INT NULL DEFAULT NULL` |
| `tipo` | `ENUM('ENTRADA', 'VENDA', 'ESTORNO', 'PERDA', 'AJUSTE') NOT NULL` |
| `quantidade` | `DECIMAL(10,3) NOT NULL` |
| `data_hora` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `observacao` | `VARCHAR(255) NULL DEFAULT NULL` |

- `PRIMARY KEY (id_movimentacao)`
- `INDEX fk_mov_lote (id_lote)`
- `INDEX fk_mov_item_venda (id_item_venda)`
- `INDEX fk_mov_funcionario (id_funcionario)`
- `CONSTRAINT fk_mov_lote FOREIGN KEY (id_lote) REFERENCES lote (id_lote)`
- `CONSTRAINT fk_mov_item_venda FOREIGN KEY (id_item_venda) REFERENCES item_venda (id_item_venda)`
- `CONSTRAINT fk_mov_funcionario FOREIGN KEY (id_funcionario) REFERENCES funcionario (id_funcionario)`

## Dependências de escrita

- INSERT pode começar por cargo, caixa, categoria raiz, marca, fornecedor e forma de pagamento. Funcionário depende de cargo. Categoria filha depende da categoria pai. Produto depende de categoria e, quando informada, marca.
- Sessão depende de caixa e operador. A venda depende da sessão. Item da venda depende de venda e produto. Cancelamento depende de item e supervisor. Pagamento depende de venda e forma de pagamento. Nota depende da venda.
- O vínculo produto-fornecedor depende dos dois cadastros. O pedido depende de fornecedor e funcionário. O item de pedido depende de pedido e produto. Um lote depende de produto e, se houver pedido, do par exato pedido-produto. A movimentação depende de lote e, quando preenchidos, item de venda e funcionário. O lote e o item referenciado por uma movimentação podem apontar para produtos diferentes sem violar as FKs.
- UPDATE de FK exige destino válido e mantém as restrições de nulabilidade e unicidade. Não expor alterações de PK pela API. Alterar quantidade ou preço do item recalcula seu subtotal, mas deixa o total da venda intacto até escrita explícita. Alterar valor ou valor recebido recalcula o troco daquela linha.
- DELETE ou alteração de chave referenciada fica bloqueado enquanto houver filhos, inclusive nas relações com FK opcional preenchida. Não há cascata ou limpeza automática. A ordem técnica de exclusão é a inversa das dependências, com filhos de categoria antes dos pais. Preservar registros operacionais e preferir inativação nos cadastros que têm `ativo`. Inativar não modifica vínculos ou históricos.
- Unicidade relevante: cada produto aparece no máximo uma vez por pedido e por vínculo com o mesmo fornecedor. A venda admite múltiplas linhas do mesmo produto e múltiplos pagamentos. Há no máximo um cancelamento por item e uma nota por venda. O índice único da chave fiscal permite múltiplas linhas com chave nula. Código de lote não tem restrição UNIQUE.
- Os tipos DECIMAL são assinados e os TINYINT de flags aceitam valores além de 0 e 1. As FKs validam existência, não atividade, cargo, propriedade, compatibilidade operacional, cronologia ou hierarquia acíclica. Os ENUMs descrevem estados e tipos, sem impor transições.

