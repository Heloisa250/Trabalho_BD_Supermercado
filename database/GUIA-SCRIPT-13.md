# Script 13 — Programação SQL do supermercado

Use MySQL Community Server 8.4 nativo e MySQL Workbench. Abra cada arquivo inteiro, preserve os comandos `DELIMITER` e pare no primeiro erro. `DELIMITER` pertence ao cliente SQL. Um driver deve enviar a definição completa de cada objeto como uma instrução. A [auditoria do Script 13](AUDITORIA-SCRIPT-13.md) identifica os relacionamentos, as chaves e as operações existentes da API.

## Instalação

1. Execute o [DDL oficial](official/Supermercado_ddl.sql), o [DML oficial](official/Supermercado_dml.sql) e [credenciais_demo.sql](../credenciais_demo.sql).
2. Execute o [Script 12](12_views.sql). A procedure de estoque depende de `vw_estoque_produtos`.
3. Execute [13_functions.sql](13_functions.sql), [13_procedures.sql](13_procedures.sql), [13_triggers.sql](13_triggers.sql) e [13_geracao_ids.sql](13_geracao_ids.sql).
4. Execute o [Script 14](14_usuarios_grupos_permissoes.sql) e [13_permissoes.sql](13_permissoes.sql). Em uma base acadêmica que já tem os Scripts 12, 14 e 15, execute somente os complementos do 13.
5. Execute o [Script 15](15_indices.sql), a [validação acadêmica](validacao_academica.sql) e [13_validacao.sql](13_validacao.sql).

A conta instaladora local precisa dos privilégios de criação de rotinas e triggers, de concessão de `EXECUTE` e das permissões sobre as referências. Os triggers usam o definidor que os instala. Mantenha essa conta acadêmica disponível com `TRIGGER` e a leitura das colunas `NEW` usadas. Se a política de binary logging impedir a criação com erro 1419, peça que um DBA autorizado da instância acadêmica instale as functions e triggers. As functions já declaram `DETERMINISTIC NO SQL`. A instalação não exige mudar a configuração global ou conceder privilégios administrativos às contas da aplicação. [MySQL 8.4 — Binary logging de programas armazenados](https://dev.mysql.com/doc/refman/8.4/en/stored-programs-logging.html)

## Functions

Uma function devolve um valor para uso em expressões SQL. Ambas são determinísticas, sem leitura de tabelas ou efeitos de escrita. Os argumentos monetários usam `DECIMAL(10,2)`. Passe valores representáveis na escala declarada. O MySQL pode converter argumentos antes de entrar na rotina.

| Nome | Parâmetros e regra | Exemplo |
|---|---|---|
| `fn_calcular_subtotal` | Quantidade positiva `DECIMAL(10,3)` e preço unitário não negativo `DECIMAL(10,2)`. Multiplica em decimal exato, arredonda a duas casas e rejeita resultado acima de 99.999.999,99. A mesma operação serve para UN, KG e L, usando a unidade do produto. | `SELECT fn_calcular_subtotal(3, 28.90);` → `86.70`. Para `1.250 × 6.99`, retorna `8.74`. |
| `fn_calcular_troco` | Valor aplicado positivo e valor recebido maior ou igual ao aplicado. Ambos usam `DECIMAL(10,2)`. Retorna a diferença em centavos exatos. Use para dinheiro quando a forma de pagamento aceita troco. | `SELECT fn_calcular_troco(130.38, 150.00);` → `19.62`. Recebimento inferior gera SQLSTATE `45000`. |

As duas retornam `DECIMAL(10,2)` e rejeitam argumentos nulos. A function de troco não escolhe a forma de pagamento nem concilia a venda. Essas regras continuam com o checkout.

## Procedures

Procedures são chamadas com `CALL` e podem retornar vários conjuntos de linhas ou parâmetros `OUT`. As duas consultas usam `SQL SECURITY INVOKER` e apenas leem dados. A conta acadêmica de leitura pode executar as consultas e as functions. O ajuste de demonstração está reservado à conta instaladora, com os próprios privilégios de leitura e escrita.

| Procedure | Parâmetros e tabelas | Resultado ou erro |
|---|---|---|
| `sp_consultar_estoque_produto` | `IN` ID do produto e data comercial. Usa `produto`, `vw_estoque_produtos` e `lote`. | `CALL sp_consultar_estoque_produto(5,'2026-11-10');` retorna físico `48.750` e vendável `0.000`. Validade igual à data comercial ainda conta. Produto inativo tem vendável zero. ID desconhecido gera `Produto inexistente.` |
| `sp_consultar_venda` | `IN` ID de venda. Lê `venda`, `sessao_caixa`, `funcionario`, `caixa`, `item_venda`, `produto`, `cancelamento_item`, `pagamento` e `forma_pagamento`. | `CALL sp_consultar_venda(3);` retorna quatro conjuntos separados. São um cabeçalho, dois itens, nenhum cancelamento e dois pagamentos. ID desconhecido gera `Venda inexistente.` |
| `sp_registrar_ajuste_lote` | `IN` IDs do lote e funcionário, saldo contado e motivo. `OUT` ID de movimentação. Atualiza `lote` e grava uma linha `AJUSTE` em `movimentacao_estoque`. A FK valida o vínculo com funcionário. | Retorna o ID somente após o commit. Lote inexistente, saldo repetido, falta de lock, FK inválida e limite de INT são tratados. |

A data comercial entra como argumento para reproduzir testes de validade e preservar a regra civil de São Paulo. As consultas não iniciam transação própria. Para ler os quatro conjuntos da venda sob o mesmo snapshot com escritores concorrentes, o cliente pode abrir uma transação de leitura em `REPEATABLE READ`.

## Triggers

Triggers executam automaticamente para cada linha afetada. Um trigger `BEFORE` pode rejeitar os dados antes da gravação. Um trigger `AFTER` é adequado para efeitos que dependem da gravação, como uma trilha de auditoria. As validações deste script precisam apenas de `BEFORE`.

| Trigger | Evento | Regra e erro |
|---|---|---|
| `trg_lote_validar_insert` | `BEFORE INSERT` em `lote` | Rejeita quantidade inicial ou atual negativa e validade anterior à fabricação, com SQLSTATE `45000`. |
| `trg_lote_validar_update` | `BEFORE UPDATE` em `lote` | Aplica as mesmas regras ao estado atualizado e permite ajuste positivo acima da quantidade inicial. |

A mensagem é `Quantidade de lote não pode ser negativa.` ou `Validade anterior à fabricação do lote.`. Datas opcionais continuam aceitas. O erro desfaz a instrução em InnoDB. Cabe ao chamador desfazer a transação inteira se houver passos anteriores. Os triggers apenas validam e preservam o registro de movimentos e os cálculos já realizados pela API.

Em uma conexão de escrita da instância acadêmica, execute as instruções abaixo individualmente. A última atualização deve falhar e o rollback deve remover o lote de teste.

```sql
USE Supermercado;
START TRANSACTION;
INSERT INTO lote (id_lote, id_produto, codigo_lote, data_entrada,
                  quantidade_inicial, quantidade_atual, custo_unitario)
VALUES (500, 1, 'QA500', UTC_TIMESTAMP(), 0, 0, 1);
UPDATE lote SET quantidade_atual = 2 WHERE id_lote = 500;
UPDATE lote SET quantidade_atual = -1 WHERE id_lote = 500;
ROLLBACK;
SELECT COUNT(*) FROM lote WHERE id_lote = 500;
```

## IDs e rollback

`AUTO_INCREMENT` é usado nos cadastros auxiliares listados na auditoria. Os IDs críticos são explícitos. A procedure de ajuste usa a PK existente, sem tabela auxiliar. Ela adquire o lock nomeado de estoque, inicia transação em `READ COMMITTED`, bloqueia o lote com `FOR UPDATE`, ajusta o saldo e calcula o próximo ID de movimentação a partir dos registros existentes. Grava o delta assinado e o horário UTC. Um handler desfaz a transação e libera o lock em caso de erro. O lock é compartilhado com os fluxos de estoque e finalização da API e permanece retido até commit ou rollback. [MySQL 8.4 — Funções de bloqueio](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html)

Execute as chamadas em conexões autocommit novas. A procedure inicia e encerra a própria transação. Uma transação já aberta é rejeitada antes do `START TRANSACTION` pela definição do isolamento da próxima transação. A chamada repetida com o mesmo saldo é rejeitada se o saldo ainda for o mesmo. Após uma perda de conexão, consulte o estado gravado antes de reenviar. A procedure não recebe uma chave de idempotência.

```sql
-- Só na instância acadêmica isolada. Esta primeira chamada faz commit.
CALL sp_registrar_ajuste_lote(1, 1, 98.000, 'Recontagem de teste', @id);
SELECT @id AS id_movimentacao;
SELECT tipo, quantidade FROM movimentacao_estoque WHERE id_movimentacao = @id;

-- Execute separadamente. A FK do funcionário falha depois do UPDATE.
CALL sp_registrar_ajuste_lote(1, 999, 99.000, 'Teste de rollback', @id);
SELECT quantidade_atual FROM lote WHERE id_lote = 1; -- continua 98.000
SELECT IS_FREE_LOCK('sqlider:Supermercado:estoque'); -- 1
```

Para demonstrar concorrência em uma carga nova, chame o ajuste de lote 1 para 98 e, em outra conexão, o ajuste do lote 2 para 39. Os IDs 12 e 13 serão gravados em uma ordem que depende de quem adquirir o lock primeiro. A PK impede duplicidade se um escritor não cooperar, mas a coordenação entre clientes depende de todos os alocadores de movimentação usarem o mesmo protocolo.

Use [13_validacao.sql](13_validacao.sql) para listar functions, procedures e triggers e conferir as definições. Nenhuma tabela auxiliar de ID é criada.

## Integração com a API

- **Consultas.** Em modo acadêmico, `GET /api/v1/estoque/produtos/:id` usa a procedure de estoque com a data comercial da API. A procedure de venda segue demonstrável no Workbench. O detalhe do PDV usa o fluxo existente para manter a titularidade da sessão e os contratos de itens e pagamentos.
- **Ajuste.** Se a API adotar a procedure transacional, a rota de ajuste em `stock/routes.ts` deve chamar a procedure em conexão limpa, fora do wrapper `transaction`, com o ID autenticado e o saldo validado. Mapear erros e manter a resposta atual. A concessão de `EXECUTE` para o ajuste deve fazer parte da migração. Uma chamada tem uma única transação e uma única movimentação.
- **IDs.** A geração SQL deste script cobre o ajuste demonstrativo. Recebimento e perda em `stock/routes.ts` e checkout em `sales/repository.ts`, `sales/service.ts` e `sales/routes.ts` continuam com `nextExplicitId` de `config/mysql-transaction.ts`. Para migrá-los, inventarie todos os escritores, mantenha o lock compartilhado e a ordem de locks do checkout, migre a geração e o INSERT na mesma transação e teste coexistência antes de trocar cada escritor. Cadastros, compras, sessões, vendas, itens e pagamentos mantêm seu próprio protocolo.

## Evidência da validação

Validação em MySQL Community Server 8.4.13 nativo no Windows, com instância temporária e conexão local. Os quatro arquivos de criação, as permissões e a validação foram executados com o cliente oficial `mysql.exe`, incluindo os comandos `DELIMITER`. O teste percorreu a carga oficial, as credenciais e os Scripts 12, 14 e 15 na mesma instância.

- Subtotal retornou `86.70`, `8.74` e `0.01` nos casos de três unidades, quantidade fracionária e meio centavo. O limite `99999999.99` foi aceito. O produto que excede o limite, preço negativo e quantidade nula foram rejeitados. O troco retornou `19.62` e rejeitou recebimento inferior e valor aplicado zero.
- A consulta de estoque retornou saldo vendável `48.750` no dia do vencimento e zero no dia seguinte. A consulta da venda 3 retornou dois pagamentos separados dos itens. A venda 4 retornou dois cancelamentos. As duas consultas rejeitaram IDs inexistentes. A conta de leitura executou as consultas e teve a chamada de ajuste negada, assim como a conta técnica da API.
- O lote de teste aceitou datas nulas e ajuste positivo acima do saldo inicial. Os triggers rejeitaram quantidades negativas e datas invertidas em INSERT e UPDATE. O rollback removeu o lote de teste.
- Duas conexões receberam os IDs 12 e 13 a partir do maior ID do DML, 11. Em teste misto, o alocador TypeScript gravou 14 e a procedure aguardou o mesmo lock e gravou 15. A repetição do saldo foi rejeitada. O limite `2147483647` foi aceito e a próxima tentativa desfez o ajuste. Uma FK inválida desfez a mudança de saldo e liberou o lock. Uma chamada dentro de transação aberta preservou o trabalho pendente do chamador.
- Ao final, as 98 linhas das 19 tabelas oficiais coincidiam com a base preparada após `credenciais_demo.sql`. Permaneceram consultáveis as duas views, as tabelas de usuário e grupo e os índices complementares. As 27 FKs, incluindo as duas do Script 14, estavam presentes. Os dois logins acadêmicos responderam HTTP 200, e o painel respondeu 200 para F0001 e 403 para F0002. A suíte existente passou com 37 testes de backend e três de frontend.

O MySQL de teste foi desligado ao término. O ensaio usou o cliente de linha de comando para os arquivos SQL e chamadas HTTP para a autenticação. A interface gráfica do Workbench não foi aberta durante o ensaio.
