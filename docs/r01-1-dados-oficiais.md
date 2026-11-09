# R01.1 — carga oficial e integração

A carga usou o commit [4bb569c5f22dcdcb3cf05ba47a6839f6367bb157](https://github.com/Heloisa250/Trabalho_BD_Supermercado/tree/4bb569c5f22dcdcb3cf05ba47a6839f6367bb157). Os hashes são os do [inventário oficial](banco-oficial.md). O container `supermercado-qualidade-lider-oficial-dev-mysql-1` executa MySQL 8.4.13, publica em `127.0.0.1:3307` e usa o schema `Supermercado`.

O pré-teste confirmou InnoDB e zero linhas nas 19 tabelas por COUNT(*). O DML contém USE e 20 INSERTs em ordem de dependência. O cliente MySQL em modo batch recebeu START TRANSACTION, o arquivo original e COMMIT. A operação terminou sem erro, com as verificações de FK habilitadas. A carga é única.

| Tabela | Esperado | Encontrado |
| --- | ---: | ---: |
| caixa | 5 | 5 |
| cancelamento_item | 2 | 2 |
| cargo | 5 | 5 |
| categoria | 5 | 5 |
| forma_pagamento | 5 | 5 |
| fornecedor | 5 | 5 |
| funcionario | 5 | 5 |
| item_pedido_compra | 5 | 5 |
| item_venda | 10 | 10 |
| lote | 5 | 5 |
| marca | 5 | 5 |
| movimentacao_estoque | 11 | 11 |
| nota_fiscal | 3 | 3 |
| pagamento | 4 | 4 |
| pedido_compra | 5 | 5 |
| produto | 5 | 5 |
| produto_fornecedor | 5 | 5 |
| sessao_caixa | 3 | 3 |
| venda | 5 | 5 |
| **Total** | **98** | **98** |

O catálogo confirmou 25 FKs. Com a conta de leitura, consultas explícitas verificaram catálogo, cargos e funcionários, cinco vínculos comerciais, cinco pedidos com itens, cinco lotes e os valores das vendas. As três vendas finalizadas conciliam com os pagamentos. A venda cancelada e a aberta mantêm valores históricos com zero pago. As consultas encontraram zero divergências em subtotais, trocos, saldos de lote, produto do item associado ao movimento, vínculos comerciais de pedidos e combinação de data de recebimento e status.

Os cinco funcionários estão ativos e têm hashes no formato hexadecimal de 64 caracteres, conforme SHA2-256 do DML. Os CPFs dos funcionários 1 a 5 e os CNPJs dos fornecedores 2 a 5 falham nos dígitos verificadores usados pela aplicação. O SQL preservou os dados demonstrativos. Para R02, selecionar matrículas e autorizar explicitamente um procedimento separado para criar credenciais bcrypt, com senha fornecida por canal protegido ou gerada no ambiente local. Atualizar apenas `senha_hash` das contas autorizadas. Revisar a lista administrativa por ambiente e validar login e logout.

A conta `supermercado_r01`@'%' tem somente SELECT em `Supermercado.*`. O verificador `npm run check:official -w backend` confirmou catálogo, identidade e grants via mysql2/promise. A API oficial na porta 3002 retornou HTTP 200 em health e ready. As rotas administrativas retornaram 401 sem sessão. As leituras de dados foram executadas em diagnóstico local com a conta dedicada. A validação HTTP autenticada dos módulos depende de R02.

A API legada 3001 e o proxy React 5175 mantiveram health e ready em 200. A visualização paralela em http://localhost:5176/ encaminhou ready à porta 3002 e preservou o controle de sessão. Ela serve para diagnóstico nesta etapa. R02 trata credenciais e acesso autenticado. R03 e R04 tratam IDs explícitos, campos obrigatórios, unicidade e unidades oficiais.
