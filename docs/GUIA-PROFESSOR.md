# Guia do professor

Instale Git, Node.js 22.12 ou superior, MySQL Community Server 8.4 e MySQL Workbench. No Windows, use o MySQL Configurator para configurar uma instância acadêmica local com porta e diretório de dados próprios. Anote a porta e a senha de administração escolhidas. A instalação usa o MySQL nativo. [Pacotes do MySQL para Windows](https://dev.mysql.com/doc/refman/8.4/en/windows-choosing-package.html)

```sh
git clone --branch codex/aplicacao-r02 https://github.com/Heloisa250/Trabalho_BD_Supermercado.git
cd Trabalho_BD_Supermercado
npm ci
```

1. No Workbench, abra uma conexão TCP com `127.0.0.1` e a porta acadêmica. Confirme com `SELECT VERSION(), @@port;` e verifique na lista de schemas que essa instância ainda está sem a base `Supermercado`.
2. Abra cada arquivo por **File → Open SQL Script** e execute o arquivo inteiro, na ordem abaixo. Use uma conexão nova para o terceiro arquivo e confira a coluna `resultado`.

   1. [Supermercado_ddl.sql](../database/official/Supermercado_ddl.sql)
   2. [Supermercado_dml.sql](../database/official/Supermercado_dml.sql)
   3. [credenciais_demo.sql](../credenciais_demo.sql)

3. Na instância acadêmica, crie uma conta técnica local para a API. Troque o valor entre aspas por uma senha técnica escolhida por você.

   ```sql
   CREATE USER 'supermercado_academico'@'127.0.0.1' IDENTIFIED BY 'ESCOLHA_UMA_SENHA_LOCAL';
   GRANT SELECT ON Supermercado.* TO 'supermercado_academico'@'127.0.0.1';
   ```

4. Copie [backend/.env.official.example](../backend/.env.official.example) para `backend/.env.official`. Defina `DB_HOST=127.0.0.1`, `DB_PORT` com a porta acadêmica, `DB_USER=supermercado_academico`, `DB_PASSWORD` com a senha escolhida e `ADMIN_MATRICULAS=F0001`. Gere um valor local para `JWT_SECRET` com `node -p "require('node:crypto').randomBytes(32).toString('hex')"`. Mantenha `PORT=3002` e a origem `http://127.0.0.1:5176` em `CORS_ORIGIN`.
5. Inicie a API e o React em terminais separados, na raiz do clone.

   ```sh
   npm run dev -w backend -- --official
   npm run dev:official -w frontend
   ```

6. Abra [a aplicação](http://127.0.0.1:5176/) e use uma das contas públicas de demonstração local.

| Perfil | Matrícula | Senha |
| --- | --- | --- |
| Administrador | F0001 | 001 |
| Supervisora | F0002 | 002 |

F0001 é Gerente no cadastro e tem acesso à administração e ao dashboard. F0002 é Supervisor de Caixa no DML e tem permissão para autorizar cancelamentos de itens. O perfil F0002 recebe HTTP 403 nas rotas administrativas. A conta técnica acima permite login e consulta. Para testar vendas ou cancelamentos com escrita, consulte as concessões do [guia do PDV](pdv-vendas.md).

A base acadêmica inicial contém **19 tabelas e 98 registros**, incluindo cinco funcionários, cinco produtos, cinco fornecedores, cinco caixas, três sessões de caixa, cinco vendas e dez itens de venda. Os 136 registros do backup pessoal pertencem a uma base separada.

- Se [health](http://127.0.0.1:3002/api/v1/health) falhar, confira se a API iniciou na porta 3002. Se [ready](http://127.0.0.1:3002/api/v1/ready) retornar 503, confira a porta, as credenciais técnicas e se o DDL foi executado na instância acadêmica.
- Se o login retornar 401, confira a matrícula, os zeros iniciais da senha e o resultado do terceiro SQL. Se a origem for recusada, abra o endereço `http://127.0.0.1:5176/` e confira `CORS_ORIGIN`.
- Se F0001 autenticar e o menu administrativo ficar indisponível, confira `ADMIN_MATRICULAS=F0001` e reinicie a API.
