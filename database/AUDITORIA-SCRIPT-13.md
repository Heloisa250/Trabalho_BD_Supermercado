# Auditoria do banco para o Script 13

A referência é o DDL e o DML oficiais do commit `4bb569c`. A carga contém 98 linhas em 19 tabelas InnoDB, incluindo exemplos de estoque, vendas finalizadas, cancelamentos e pagamentos múltiplos. O catálogo antes do Script 13 estava sem functions, procedures e triggers no schema. O trigger de falha usado em testes isolados de checkout pertence ao próprio teste.

| Chave no DDL | Tabelas e colunas |
|---|---|
| Inteira com `AUTO_INCREMENT` | `caixa.id_caixa`, `cargo.id_cargo`, `forma_pagamento.id_forma_pagamento`, `marca.id_marca`, `categoria.id_categoria`. |
| Inteira explícita | `fornecedor.id_fornecedor`, `funcionario.id_funcionario`, `produto.id_produto`, `sessao_caixa.id_sessao`, `venda.id_venda`, `item_venda.id_item_venda`, `pagamento.id_pagamento`, `nota_fiscal.id_nota_fiscal`, `pedido_compra.id_pedido`, `lote.id_lote`, `movimentacao_estoque.id_movimentacao`, `cancelamento_item.id_cancelamento`. |
| Composta | `produto_fornecedor(id_produto,id_fornecedor)`, `item_pedido_compra(id_pedido,id_produto)`. |

O DDL contém 25 FKs e sete restrições de unicidade além das PKs. As FKs conectam funcionário a cargo, venda a sessão, itens e pagamentos a venda, cancelamento a item e supervisor, lote a produto e opcionalmente a item de pedido, e movimentação a lote e opcionalmente a item e funcionário. O lote tem código único por produto e aceita datas de fabricação e validade nulas. As quantidades são `DECIMAL(10,3)` e os valores monetários relevantes são `DECIMAL(10,2)`. O DDL deixa a validação de quantidades de lote e ordem de datas para as operações de escrita.

O Script 12 cria uma view por venda finalizada e uma por produto. A procedure de estoque reaproveita o saldo físico da segunda e acrescenta o saldo vendável para a data civil informada. A consulta de venda precisa cobrir os três status, por isso consulta a tabela oficial. O Script 14 acrescenta duas FKs para os vínculos de usuário e duas contas locais. O Script 15 acrescenta índices de vendas e de movimentação. Os complementos do Script 13 usam esses objetos conforme a ordem indicada no guia.

## Operações que a API já executa

- `sales/decimal.ts` e `sales/service.ts` calculam subtotal em milésimos e centavos, arredondam por linha e mantêm o total dos itens elegíveis. `sales/checkout.ts` valida forma, valor recebido, troco e composição do pagamento. A finalização usa uma transação para pagamento, baixa FEFO, movimento e status. Um trigger de venda que alterasse total ou estoque repetiria efeitos já executados nesse fluxo.
- `stock/routes.ts` grava recebimento, entrada, perda ou ajuste com saldo e movimento na mesma transação. Um ajuste guarda o delta assinado, conserva a quantidade inicial e rejeita a contagem igual ao saldo. Os triggers SQL apenas rejeitam estados de lote inválidos e permitem ajustes positivos acima da quantidade inicial.
- `cash/routes.ts` serializa a abertura de sessão. `purchases/repository.ts` protege criação de pedido e itens. `admin/repository.ts` usa locks por tabela para cadastros oficiais com IDs explícitos. A autenticação permanece baseada em funcionário, matrícula, bcrypt e política administrativa da API.

## Controle de IDs existente

`config/mysql-transaction.ts` fornece `transaction` e `nextExplicitId`. A conexão adquire o lock nomeado antes da transação, lê o maior ID, soma um e rejeita valores acima de INT. O lock é liberado após commit ou rollback.

| Escritor | IDs ou escopo | Coordenação atual |
|---|---|---|
| `admin/repository.ts` | Funcionário, fornecedor e produto | Lock por tabela. |
| `cash/routes.ts` | Sessão de caixa | Lock de sessão de caixa. |
| `purchases/repository.ts` | Pedido de compra | Lock de pedido. |
| `sales/service.ts`, `sales/repository.ts` e `sales/routes.ts` | Venda, item, cancelamento, pagamento e movimentos de venda | Lock do PDV. No checkout, adquire também o lock de estoque, nessa ordem. |
| `stock/routes.ts` | Lote e movimentação | Lock `sqlider:Supermercado:estoque` mantido até o fim da transação. |

O Script 13 demonstra a geração do ID de movimentação porque esse ID tem mais de um escritor na API e ambos já respeitam o lock de estoque. O ajuste SQL usa exatamente esse lock, na mesma conexão do cálculo e da inserção. Uma tabela de sequência introduziria outra fonte para o mesmo ID. O banco conserva a PK como proteção final contra uma gravação direta que ignore o protocolo. Um escritor externo que não respeite o lock pode disputar o mesmo número e causar erro de duplicidade ou interferir na política de ordenação.
