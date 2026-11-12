# R03 — administração oficial

A API oficial usa o schema `Supermercado` na porta 3307 e o React em http://127.0.0.1:5176/. Entre como F0001 e navegue por Funcionários, Cargos, Terminais de caixa e Formas de pagamento. Os formulários de cadastro exigem as flags obrigatórias e o servidor fornece o ID técnico do funcionário.

O alocador adquire `GET_LOCK` antes de iniciar a transação. Na mesma conexão, valida o cargo, calcula o próximo ID dentro da faixa INT e grava o funcionário. Libera o lock após commit ou rollback. Timeout e colisão são tratados como conflito. Escritores externos precisam seguir o mesmo protocolo para evitar colisões, e a chave primária permanece como proteção definitiva.

O mesmo protocolo serializa a checagem de nome de cargo e descrição de forma de pagamento nas criações e edições. Essas duas unicidades são regras da aplicação no perfil oficial. Número de caixa, CPF e matrícula continuam protegidos pelo DDL. F0001 não pode ser desativado nem ter sua matrícula alterada pelas rotas administrativas. CPF importado inválido continua legível. Alterações parciais que omitem o CPF preservam o valor original.

## Conta aplicada no ambiente oficial

Destino exclusivo: container `supermercado-qualidade-lider-oficial-dev-mysql-1`, MySQL da porta 3307. A conta `supermercado_r03_app`@'%' substituiu apenas a credencial da API oficial. O SELECT no schema preserva as consultas existentes de autenticação, administração e catálogo. A escrita fica limitada às quatro tabelas do R03. As contas de diagnóstico e de provisionamento de senha não precisam de mudanças.

```sql
CREATE USER 'supermercado_r03_app'@'%' IDENTIFIED BY '<senha aleatória exclusiva>';
GRANT SELECT ON Supermercado.* TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.funcionario TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.cargo TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.caixa TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.forma_pagamento TO 'supermercado_r03_app'@'%';
SHOW GRANTS FOR 'supermercado_r03_app'@'%';
```

Após a autorização, configure a credencial em `backend/.env.official` e reinicie somente a API 3002. Valide o login de F0001, liste os registros importados, crie um cargo e um funcionário demonstrativos, confirme o ID explícito e faça edições e desativação apenas nos registros novos. Cadastre e edite um caixa e uma forma de pagamento de teste. Confirme persistência após recarregar, duplicidades e proteção contra caixa com sessão aberta. Preserve os 98 registros oficiais existentes. A sessão de F0001 requer a senha escolhida pelo titular, sem compartilhamento pelo chat.

## Resultados do R03.1

A conta R03 foi configurada na API 3002 e confirmada pelo verificador de grants. O ensaio Docker separado na porta 3317 carregou as 19 tabelas, 25 FKs e 98 registros a partir do Git. Uma nova tentativa de inicialização foi rejeitada porque o schema já existia. O volume de ensaio foi preservado.

Na base oficial, foram criados o cargo 6, os funcionários 6 e 7, o caixa 6 de número 31931 e a forma de pagamento 6, identificados por Demo R031 MW9HKY6F. O teste concorrente retornou IDs distintos. Os dois funcionários, o caixa e a forma ficaram inativos. As contagens finais das tabelas de funcionários, cargos, caixas e formas foram 7, 6, 6 e 6. Os cinco funcionários importados foram comparados antes e depois e mantiveram seus dados.

O CRUD foi executado pelos serviços da aplicação com o MySQL real. O funcionário demonstrativo autenticou com bcrypt, recebeu 403 na administração e perdeu acesso à sessão após desativação. A tentativa de desativar o caixa com sessão aberta foi rejeitada. O usuário informou que abriu o painel F0001. Na aba controlável, só foi possível observar a tela de login, de modo que o CRUD e a persistência no navegador não foram verificados diretamente nesta execução.