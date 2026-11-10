# Validação do R00

O [Script 05](purchases-dev.md) usa `pedido_compra` com ID, data e status explícitos e `item_pedido_compra` com chave composta. Após as duas concessões autorizadas, o Script 05.1 validou criação, edição, envio e cancelamento no ambiente oficial. A contagem passou de cinco para sete pedidos e de cinco para seis itens, com os pedidos históricos preservados.

## Estrutura executada

O DDL oficial foi importado em MySQL 8.4.13 no container paralelo `supermercado-qualidade-lider-oficial-dev-mysql-1`. A verificação anterior confirmou a ausência do schema e o SHA-256 do arquivo montado. A importação concluiu sem erros.

O INFORMATION_SCHEMA confirmou 19 tabelas InnoDB, 120 colunas, 89 colunas não anuláveis, 19 PKs, 25 FKs, sete restrições UNIQUE e 48 índices físicos. Os cinco campos AUTO_INCREMENT pertencem a caixa, cargo, categoria, forma de pagamento e marca. Nenhuma coluna é gerada. O catálogo não retornou defaults não nulos. A configuração herdada é utf8mb4 com utf8mb4_0900_ai_ci. O servidor usa `lower_case_table_names=0` e o nome efetivo é `Supermercado`.

Os ENUMs confirmados são PENDENTE, ENVIADO, RECEBIDO e CANCELADO em compras, UN, KG e L em produtos, ABERTA, FINALIZADA e CANCELADA em vendas, e ENTRADA, SAIDA_VENDA, AJUSTE e PERDA em movimentações. Funcionário, produto e pedido têm zero linhas. O DML permanece pendente.

Os quatro arquivos locais correspondem aos blobs do commit oficial. O arquivo legado mantém o SHA-256 `852f952239a8a096f99e3da0964c503099799fab483b47b301cf96386c3b734a`. A API legada retornou HTTP 200 em health e ready. Não houve validação da aplicação conectada ao schema novo.

## Auditoria estática do DML

O DML prevê 98 registros, com contagens idênticas às esperadas no teste oficial.

| Linhas | Tabelas |
| --- | --- |
| 5 por tabela | caixa, cargo, forma_pagamento, marca, categoria, fornecedor, funcionario, produto, venda, pedido_compra, produto_fornecedor, item_pedido_compra, lote |
| 3 por tabela | sessao_caixa, nota_fiscal |
| 10 | item_venda |
| 4 | pagamento |
| 11 | movimentacao_estoque |
| 2 | cancelamento_item |

A ordem dos blocos resolve as dependências declaradas em uma base nova. O DML combina IDs explícitos com referências a sequências iniciadas em 1 nas tabelas de apoio. A repetição pode gerar duplicatas e referências incorretas. A revisão estática identificou CPF inválido pelo dígito verificador nos funcionários 1 a 5 e CNPJ inválido nos fornecedores 2 a 5. O DDL valida tamanho e unicidade desses campos. A API exige dígitos verificadores válidos para novos cadastros. A amostra de funcionários usa SHA2-256, incompatível com o verificador bcrypt atual.

Os pagamentos das três vendas finalizadas coincidem com os respectivos totais na amostra. Subtotais e trocos declarados são coerentes com as operações apresentadas. Os saldos de lote coincidem com entradas e saídas demonstradas. A venda cancelada mantém valor histórico de 19,56 e zero pagamentos. Isso exige filtros de status em indicadores. A venda aberta também tem valor estimado sem pagamento. Chaves e notas do DML têm finalidade demonstrativa.

## Auditoria estática do SQL de testes

O arquivo seleciona o schema e executa oito conjuntos de consultas de leitura. Contagens, vínculos de funcionários, hierarquia, catálogo, totais e lotes cobrem uma amostra útil. Os resultados são tabulares e a execução bem-sucedida, por si só, não verifica os valores esperados.

- A soma de subtotais inclui itens cancelados e não recalcula quantidade vezes preço. Deve ser interpretada como conferência do valor histórico da amostra.
- A consulta de pagamentos não verifica troco, formas sem troco ou a consistência individual do valor recebido.
- A reconciliação de estoque trata todo tipo diferente de ENTRADA como negativo. A convenção de AJUSTE precisa ser definida antes de usar essa consulta como validação geral. O INNER JOIN oculta lotes sem movimento.
- A consulta de lote e pedido comprova o vínculo da amostra. Regras de recebimento parcial, validade, produto do item de venda e alocação de lotes ainda exigem casos próprios.

A execução integral do arquivo de testes não foi realizada. A revisão automática bloqueou o envio do arquivo ao cliente MySQL por falta de confirmação sobre o conteúdo e o escopo da autorização. Os metadados acima foram verificados por consultas próprias e explícitas de leitura. A importação de dados, as consultas oficiais sobre dados carregados, o ensaio de restauração e os testes de compatibilidade da aplicação ficam para etapas autorizadas.


## R03 — verificação administrativa

O R03.2 confirmou os fluxos administrativos. A captura dos códigos HTTP autenticados no navegador e a apresentação visual do conflito de caixa com sessão aberta em ambiente isolado ficaram pendentes.

Para o R04, a inspeção por leitura do `INFORMATION_SCHEMA` confirmou as cinco tabelas do catálogo no MySQL oficial. O R04.1 confirmou as concessões de escrita e a persistência de duas categorias, uma marca, um produto, um fornecedor e um vínculo demonstrativos. O [roteiro do catálogo](catalog-dev.md) registra as concessões e os limites da validação automatizada.

A auditoria confirma ID explícito em funcionario, AUTO_INCREMENT em cargo, caixa e forma_pagamento, e ausência de defaults não nulos nas quatro tabelas. CPF, matrícula e número do caixa permanecem únicos no DDL. A unicidade de cargo e forma é implementada na aplicação. Os testes isolados cobrem alocação concorrente, rollback, timeout, limite de INT, duplicidade e proteção administrativa. A validação real de escrita depende de concessões específicas no MySQL oficial.
