# Supermercado Qualidade Líder — guia do banco acadêmico

A base MySQL registra catálogo, compras, estoque por lote, sessões de caixa, vendas e pagamentos. Os scripts complementares acrescentam relatórios consultáveis, vínculos de usuários a perfis e índices para consultas do painel.

## Instalação no Windows

Use MySQL Community Server **8.4** e MySQL Workbench. Configure uma instância acadêmica com diretório de dados e porta próprios, acessível por TCP em `127.0.0.1`. A conta instaladora precisa de permissões para criar o schema e os objetos, importar dados, criar contas locais e conceder os privilégios declarados. Use uma conexão instaladora separada das conexões da aplicação e da auditoria.

Antes da carga, confira a versão, a porta, o diretório de dados e se já existem a base ou as contas reservadas para a atividade. O nome do schema costuma aparecer em minúsculas no Windows.

```sql
SELECT VERSION(), @@port, @@datadir, @@lower_case_table_names, CURRENT_USER();
SELECT SCHEMA_NAME FROM information_schema.SCHEMATA
WHERE LOWER(SCHEMA_NAME) = 'supermercado';
-- Execute com a conta instaladora, se ela tiver acesso ao catálogo de contas.
SELECT User, Host FROM mysql.user
WHERE User IN ('supermercado_acad_leitura', 'supermercado_acad_app');
```

Em uma instância acadêmica nova, abra cada arquivo inteiro no Workbench. Configure o editor para parar no primeiro erro.

1. [DDL oficial](official/Supermercado_ddl.sql) do commit `4bb569c`.
2. [DML oficial](official/Supermercado_dml.sql), com 98 linhas em 19 tabelas.
3. [Credenciais demonstrativas](../credenciais_demo.sql), em uma conexão nova. Confira o resultado de confirmação do script.
4. [Script 12 — Views](12_views.sql).
5. [Script 13 — Functions, procedures, triggers e IDs](GUIA-SCRIPT-13.md). Execute os quatro arquivos de criação na ordem indicada.
6. [Script 14 — Usuários, grupos e permissões](14_usuarios_grupos_permissoes.sql). Guarde privadamente as senhas aleatórias retornadas pelo `CREATE USER`.
7. [Permissões do Script 13](13_permissoes.sql).
8. [Script 15 — Índices](15_indices.sql). Salve os resultados de `EXPLAIN FORMAT=JSON` de antes e depois.
9. [Validação acadêmica](validacao_academica.sql), com consultas de conferência, e [validação do Script 13](13_validacao.sql).

Os scripts complementares são de instalação única. Antes de retomar uma execução parcial, consulte `SHOW FULL TABLES`, `SHOW CREATE TABLE`, `SHOW CREATE VIEW`, `SHOW INDEX` e `SHOW GRANTS` para identificar o último comando concluído. DDL e comandos de contas podem fazer commit implícito. Se a falha ocorreu entre `START TRANSACTION` e `COMMIT` do Script 14, execute `ROLLBACK` na mesma conexão antes de corrigir a carga. Uma nova instalação pode usar outro diretório de dados acadêmico e outra porta.

## Script 12 — Views

| View | Granularidade e tabelas | Colunas |
|---|---|---|
| `vw_vendas_finalizadas` | Uma linha por venda finalizada. Usa `venda`, `sessao_caixa`, `caixa`, `funcionario`, `item_venda`, `cancelamento_item` e `pagamento`. A FK de `pagamento.id_forma_pagamento` permite contar formas distintas sem consultar suas descrições. | `id_venda`, `data_hora`, `status`, `id_operador`, `operador`, `numero_caixa`, `valor_total`, `itens_ativos`, `pagamentos`, `formas_pagamento`, `valor_pago`, `troco_total`. |
| `vw_estoque_produtos` | Uma linha por produto. Usa `produto`, `categoria`, `marca` e `lote`. A soma dos lotes preserva a unidade do produto. | `id_produto`, `nome`, `codigo_barras`, `categoria`, `marca`, `unidade_medida`, `ativo`, `estoque_fisico`, `estoque_minimo`, `estoque_maximo`, `situacao_estoque`. |

A view de vendas agrega itens e pagamentos separadamente antes de combinar as duas relações 1:N. `itens_ativos` conta linhas, pois somar quantidades de produtos em UN, KG e L geraria uma medida sem unidade comum. `valor_total` conserva o valor histórico e `valor_pago` totaliza o valor aplicado à venda. A view de estoque inclui lotes vencidos no saldo **físico** e mostra zero para produtos sem lote. O saldo **vendável** depende da data comercial e da atividade do produto, conforme a regra da API de estoque.

As views usam `SQL SECURITY INVOKER`. A instalação precisa de `CREATE VIEW` e privilégios de leitura sobre as referências. A consulta exige `SELECT` sobre a view e as referências usadas, e a inspeção da definição exige também `SHOW VIEW`. O MySQL registra como definidor a conta que executa a criação. As views expõem o nome do operador para identificação no relatório e excluem matrícula, CPF e hash.

```sql
SELECT id_venda, valor_total, itens_ativos, pagamentos, valor_pago
FROM vw_vendas_finalizadas ORDER BY id_venda;
SELECT nome, unidade_medida, estoque_fisico, situacao_estoque
FROM vw_estoque_produtos ORDER BY nome;
```

**Integração com a API.** Em modo acadêmico, [dashboard/repository.ts](../backend/src/modules/dashboard/repository.ts) consulta a view em `dashboardRepository.revenueSeries`, consumido por `GET /api/v1/dashboard/vendas/serie`. O cálculo de `periodo` conserva `bucketSql('data_hora', grouping)`. A consulta diária tem esta forma:

```sql
-- Exemplo da série diária. Na API, mantenha a expressão atual de agrupamento
-- que converte o timestamp UTC para o calendário comercial.
SELECT DATE(data_hora - INTERVAL 3 HOUR) AS periodo,
       COUNT(*) AS vendas, SUM(valor_total) AS faturamento
FROM vw_vendas_finalizadas
WHERE data_hora >= ? AND data_hora < ?
GROUP BY periodo ORDER BY periodo;
```

A API também consulta a view de estoque por meio de `GET /api/v1/estoque/produtos/:id`, que chama `sp_consultar_estoque_produto`. A listagem de estoque mantém seus filtros, alertas e paginação.

## Script 14 — Usuários e permissões

- `grupos_usuarios.codigo_grupo VARCHAR(20)` é a chave primária e identifica unicamente cada grupo.
- `usuarios.id_funcionario INT` é chave primária e FK para `funcionario.id_funcionario`. Cada funcionário pode ter zero ou um vínculo de usuário. O cadastro de origem continua armazenando nome, matrícula e credencial.
- `usuarios.codigo_grupo VARCHAR(20) NOT NULL` é FK para `grupos_usuarios.codigo_grupo`. Cada usuário pertence a um grupo e um grupo pode ter vários usuários. Uma FK direta cobre os perfis acadêmicos mutuamente exclusivos. As FKs impedem a exclusão de um funcionário ou grupo ainda referenciado.

| Matrícula | Grupo no banco | Acesso vigente na aplicação |
|---|---|---|
| F0001 | ADMINISTRADOR | Administração por `ADMIN_MATRICULAS=F0001`. Credencial acadêmica `001`. |
| F0002 | SUPERVISOR | Autoriza cancelamento conforme `cargo.pode_cancelar_item`. Recebe HTTP 403 em rotas administrativas. Credencial acadêmica `002`. |
| F0003 e F0004 | OPERADOR | Vínculos de exemplo para os operadores do DML. |

As contas MySQL identificam a conexão técnica. Os grupos identificam funcionários na aplicação. As duas contas acadêmicas usam o host `127.0.0.1` e recebem senhas independentes geradas pelo servidor.

- `supermercado_acad_leitura` consulta views, grupos e colunas necessárias nas tabelas de origem. Pode inspecionar as views e recebe acesso apenas às colunas identificadoras e de relacionamento de `funcionario`.
- `supermercado_acad_app` tem leitura do schema para o backend, incluindo os hashes necessários ao bcrypt. Pode inserir e atualizar cadastros, pedidos, lotes, sessões e vendas nas tabelas declaradas. Pode inserir registros em `pagamento`, `cancelamento_item` e `movimentacao_estoque`. As concessões excluem alteração de grupos, DELETE, DDL e delegação de privilégios.

Para abrir a aplicação, siga o [guia da aplicação](../docs/GUIA-PROFESSOR.md). O instalador grava a conta técnica, a porta, `ACADEMIC_DEMO=1` e `ADMIN_MATRICULAS=F0001` em `backend/.env.official`. Se instalar manualmente os SQLs, preencha o arquivo com os mesmos parâmetros e a senha da conta técnica. O comando auxiliar `check:official` foi escrito para os perfis antigos e exige o host `%` e 19 tabelas. Para esta instalação, use a validação SQL e a API padrão.

Em conexões distintas no Workbench, teste os privilégios. Execute a alteração reversível somente na instância acadêmica, em uma conexão nova.

```sql
-- Ambas as contas.
SELECT CURRENT_USER();
SHOW GRANTS;
SELECT id_venda, valor_total FROM Supermercado.vw_vendas_finalizadas;

-- Leitura: espere erro ao executar cada instrução separadamente.
SELECT senha_hash FROM Supermercado.funcionario;
UPDATE Supermercado.categoria SET nome = 'Validação acadêmica' WHERE id_categoria = 1;

-- Aplicação: espere uma linha afetada e confira que o ROLLBACK restaurou o valor.
START TRANSACTION;
UPDATE Supermercado.categoria SET nome = 'Validação acadêmica' WHERE id_categoria = 1;
SELECT ROW_COUNT() AS linhas_afetadas;
ROLLBACK;
SELECT nome FROM Supermercado.categoria WHERE id_categoria = 1;

-- Aplicação: espere erro.
UPDATE Supermercado.usuarios SET codigo_grupo = 'OPERADOR' WHERE id_funcionario = 1;
```

**Integração com o login.** No modo acadêmico, `employeeRepository.byMatricula` e `byId` consultam os vínculos em login e sessão. O serviço mantém bcrypt e a regra de cargo para cancelamento. A administração exige grupo ADMINISTRADOR e matrícula permitida. O cadastro de funcionário grava o vínculo OPERADOR na mesma transação.

## Script 15 — Índices

| Índice B-tree | Colunas | Justificativa |
|---|---|---|
| `ix_venda_status_data` em `venda` | `status, data_hora` | A consulta de faturamento filtra por igualdade de status e intervalo de data. A ordem das colunas permite localizar a faixa de datas dentro do status selecionado. |
| `ix_movimentacao_data` em `movimentacao_estoque` | `data_hora` | A listagem gerencial aceita um intervalo sem filtro de lote. O índice de FK que começa por `id_lote` atende buscas por lote. O InnoDB inclui a PK no índice secundário, o que permite avaliar a ordenação por data e ID na consulta. |

O script inventaria as PKs, as chaves únicas e os índices de FK antes de criar índices. A consulta de validade do dashboard usa `CASE` e uma ordenação por situação. Um índice simples de validade não foi adotado para essa forma da consulta. Para pedidos por fornecedor, o índice da FK e a PK dos itens já são candidatos. Com o DML disponível, um índice adicional não se justificou. Cada novo índice ocupa espaço e exige manutenção em inserções e atualizações das colunas indexadas.

O [Script 15](15_indices.sql) já inclui as mesmas quatro consultas em `EXPLAIN FORMAT=JSON` antes e depois. Compare `access_type`, `possible_keys`, `key`, `rows_examined_per_scan` e `query_cost`. O custo é estimativa do otimizador. O DML tem poucas linhas, e o plano pode preferir uma varredura completa mesmo quando há um índice candidato.

## Erros comuns

- **Objeto já existe**. Confira o catálogo e o histórico da conexão. Os scripts usam criação explícita para tornar conflitos visíveis.
- **Acesso negado**. Confira `CURRENT_USER()`, o host `127.0.0.1`, a porta e as permissões. Nas views, confira também a leitura das referências.
- **Falha de FK ou de unicidade**. Use `SHOW CREATE TABLE usuarios` e verifique a matrícula em `funcionario` e o grupo em `grupos_usuarios`.
- **Login HTTP 401**. Confira os zeros iniciais das credenciais acadêmicas e o resultado de `credenciais_demo.sql`. Para F0001, confira `ADMIN_MATRICULAS` se o login funcionar e o menu administrativo ficar indisponível.

## Evidência da validação

Execução em MySQL Community Server **8.4.13 nativo no Windows**, com instância, porta e diretório de dados isolados. A carga oficial foi seguida por `credenciais_demo.sql` e pelos Scripts 12, 14 e 15.

- **Views:** 3 vendas finalizadas e 5 produtos. As comparações com as tabelas de origem retornaram zero divergências. Em transação reversível, um produto sem lote retornou saldo zero, o cancelamento de um item reduziu a contagem sem mudar o valor histórico da venda e uma venda sem pagamentos retornou contagem e total pago iguais a zero. O estoque conserva a unidade do cadastro.
- **Usuários e grupos:** quatro vínculos de funcionário e três grupos. As duas FKs rejeitaram referências inexistentes e a PK rejeitou o vínculo duplicado. A conta de leitura consultou as duas views e teve a leitura do hash e a escrita negadas. A conta da API atualizou uma categoria com rollback e teve a alteração de grupos negada. `CURRENT_USER()` retornou os dois perfis locais esperados.
- **Autenticação atual:** F0001 e F0002 autenticaram por HTTP com a conta técnica acadêmica. O resumo administrativo retornou HTTP 200 para F0001 e HTTP 403 para F0002. A aplicação nessa verificação ainda usava as consultas de autenticação originais.
- **Integridade:** as 98 linhas das 19 tabelas oficiais foram comparadas antes e depois dos complementos, tomando como referência a carga já preparada com as credenciais acadêmicas. As 25 FKs oficiais e as duas complementares estavam presentes. As quatro consultas avaliadas no Script 15 retornaram os mesmos dados antes e depois.

Os [planos EXPLAIN capturados](evidencia_explain_mysql_8_4.json) estão na ordem do Script 15. Os valores de linhas abaixo são estimativas por varredura da tabela principal da consulta.

| Consulta | Antes | Depois | Custo estimado antes → depois |
|---|---|---|---|
| Faturamento de vendas finalizadas por período | `ALL`, sem índice candidato, 5 linhas | `range`, candidato e escolhido `ix_venda_status_data`, 3 linhas | 0,75 → 1,61 |
| Lotes por situação de validade | `ALL`, sem candidato, 5 linhas | Mesmo plano | 0,75 → 0,75 |
| Pedidos por fornecedor e período | `ref`, candidato e escolhido `fk_pedido_compra_fornecedor`, 2 linhas | Mesmo plano | 0,98 → 0,98 |
| Movimentações por período | `ALL`, candidato `fk_movimentacao_estoque_lote`, 11 linhas | `range`, candidato adicional e escolhido `ix_movimentacao_data`, 6 linhas | 3,43 → 7,16 |

Os novos índices permitiram acesso por faixa nas duas consultas selecionadas. O custo estimado aumentou nessa amostra e a execução não mediu tempo. O benefício em bases maiores permanece por medir.
