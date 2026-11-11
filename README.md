# Supermercado Qualidade Líder

A fonte oficial do banco é o repositório Trabalho_BD_Supermercado. Consulte [a auditoria oficial](docs/banco-oficial.md), [o plano de migração](docs/plano-migracao.md) e [o roteiro de revalidação](docs/roadmap.md). As instruções abaixo executam a aplicação existente com o ambiente legado durante a migração.

API Express e interface React de diagnóstico. Use Node.js 22.12+.

Na raiz, execute `npm install`. Em dois terminais, execute:

```sh
npm run dev -w backend
npm run dev -w frontend -- --port 5175
```

Abra http://127.0.0.1:5175/. Em desenvolvimento, o Vite encaminha `/api/v1` para `http://127.0.0.1:3001`. Se mudar a porta da API, ajuste `FRONTEND_API_TARGET` em `frontend/.env`. Se usar `VITE_API_URL` para acessar a API diretamente, liste as origens autorizadas em `CORS_ORIGIN` no backend, separadas por vírgula.

`GET /api/v1/health` verifica a API. `GET /api/v1/ready` responde 503 quando a configuração do banco está ausente ou a consulta de conectividade falha. Com conexão, executa `SELECT 1`.

## MySQL

Solicite à equipe de banco uma instância MySQL 8 em execução com o schema original `supermercado` provisionado e uma conta dedicada com acesso de leitura para diagnóstico. A aplicação rejeita `root`. O SQL histórico do ambiente legado está na raiz do projeto. Os arquivos oficiais estão em database/official/. A aplicação nunca executa a importação.

Copie `backend/.env.example` para `backend/.env`, preencha host, porta e credenciais da conta dedicada e reinicie o backend. Para verificar as tabelas, conecte-se pelo cliente MySQL com a mesma conta, usando `-p` para informar a senha no prompt:

```sh
mysql -h HOST -P PORTA -u USUARIO -p supermercado
```

```sql
SELECT DATABASE();
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'supermercado' AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
```

Compare as 19 tabelas visíveis com [o inventário do SQL](docs/analise-banco.md). Se houver divergência, solicite à equipe de banco que verifique o provisionamento e as permissões.

`npm test` verifica os contratos HTTP com um diagnóstico de banco substituível. `npm run build` compila os dois workspaces. `npm start` inicia o backend compilado.


## Como acessar o sistema — Credenciais acadêmicas

Clone a branch `codex/aplicacao-r02` do [repositório Trabalho_BD_Supermercado](https://github.com/Heloisa250/Trabalho_BD_Supermercado). Instale Node.js 22.12 ou superior, MySQL Community Server 8.4 e MySQL Workbench. Use uma instância local do MySQL separada do banco pessoal. No Workbench, conecte-se a essa instância e execute os arquivos inteiros, nesta ordem:

1. [Supermercado_ddl.sql](database/official/Supermercado_ddl.sql)
2. [Supermercado_dml.sql](database/official/Supermercado_dml.sql)
3. [credenciais_demo.sql](credenciais_demo.sql)

Execute o terceiro arquivo em uma conexão nova e confira o resultado no Workbench. Ele atualiza somente as senhas de F0001 e F0002. Se alguma matrícula estiver ausente ou duplicada, o resultado informa o rollback.

| Perfil | Matrícula | Senha |
| --- | --- | --- |
| Administrador | F0001 | 001 |
| Supervisora | F0002 | 002 |

As senhas são públicas e destinadas à apresentação acadêmica local. F0001 é Gerente no DML oficial e recebe acesso administrativo via `ADMIN_MATRICULAS=F0001`. F0002 mantém o cadastro de Carlos Eduardo Ribeiro, Supervisor de Caixa, com autorização para cancelar itens e sem acesso administrativo.

Copie `backend/.env.official.example` para `backend/.env.official` no clone acadêmico. Configure `DB_HOST` e `DB_PORT` para a instância local (normalmente `127.0.0.1` e `3306`), `DB_USER` e `DB_PASSWORD` para uma conta técnica dedicada, `JWT_SECRET` com um valor aleatório de pelo menos 32 caracteres e `ADMIN_MATRICULAS=F0001`. Mantenha a API em `3002` e a origem do React em `http://127.0.0.1:5176`. A conta técnica precisa de leitura para login e consulta. Para operações de escrita, aplique as concessões do módulo correspondente.

Na raiz do projeto, execute `npm ci`. Em dois terminais, execute:

```sh
npm run dev -w backend -- --official
npm run dev:official -w frontend
```

Abra [a interface acadêmica](http://127.0.0.1:5176/) e entre com uma das contas da tabela.

O [guia do professor](docs/GUIA-PROFESSOR.md) detalha a instalação nativa, a criação da conta de leitura e como diagnosticar erros de conexão ou login.

## Administração no ambiente oficial

O [TRANSFER-01 — Restaurar o Supermercado em outro computador](docs/transfer-01.md) leva o estado completo do MySQL oficial (backup cifrado, testado em restauração isolada) e explica a instalação no novo computador.

O [Script 11 — Interface e UX](docs/interface-ux.md) traz o diagnóstico da interface, a regra temporal única (datas comerciais em America/Sao_Paulo, timestamps em UTC), a investigação da venda nº 7 e o roteiro de apresentação. `npm test` na raiz executa os testes do back-end e do front-end.

O [Script 10 — Dashboard gerencial](docs/dashboard-metricas.md) traz o dicionário de métricas, a convenção de fuso (UTC gravado, Brasília exibido), as consultas e o procedimento de verificação. A página fica em `/admin/dashboard`, restrita a administradores.

O [Script 09 — Pagamentos e finalização](docs/pagamentos-finalizacao.md) documenta o contrato de `valor`, `valor_recebido` e `troco`, a baixa FEFO, a ordem de bloqueios, o comprovante demonstrativo e a validação em cópia isolada do banco.

O [Script 08 — Frente de Caixa (PDV)](docs/pdv-vendas.md) documenta abertura de venda, itens por código de barras, totais, cancelamentos autorizados por supervisor, endpoints `/api/v1/vendas` e as concessões MySQL necessárias. A tela fica em `/pdv`.

O [Script 07 de sessões de caixa](docs/cash-sessions.md) documenta abertura, conferência, fechamento e a concessão necessária no MySQL oficial.

O [Script 06 de estoque e lotes](docs/stock-official.md) descreve recebimento, entradas, perdas, ajustes, alertas de validade e permissões para escrita.

O [catálogo R04](docs/catalog-dev.md) descreve o contrato do banco oficial e as concessões específicas para habilitar escrita após autorização.

O [Script 05 de pedidos de compra](docs/purchases-dev.md) documenta o fluxo do fornecedor ao envio, os endpoints e as permissões da conta oficial. Itens gravados podem ser editados enquanto o pedido estiver pendente. A interface não oferece remoção individual. Recebimento e estoque pertencem ao Script 06.

Use a API oficial em 3002 e o React de validação em 5176. A conta de leitura permite consultar os dados oficiais. O [guia R03](docs/r03-admin-oficial.md) detalha a preparação da conta de escrita e os testes reais ainda pendentes.

## Como executar o Supermercado Qualidade Líder em outro computador

Instale o Git, o Node.js 22.12 ou superior e o Docker Desktop com containers Linux. Abra o Docker Desktop e confira `docker info`. Clone a branch que contém a aplicação, entre na raiz do projeto e execute `npm ci`. O clone inclui os SQLs oficiais fixados no commit 4bb569c e o instalador valida seus hashes.

Em PowerShell, numa instalação nova:

```powershell
node -e "require('node:fs').writeFileSync('.env.official','MYSQL_OFFICIAL_PORT=3307\nMYSQL_ROOT_PASSWORD='+require('node:crypto').randomBytes(32).toString('hex')+'\n',{flag:'wx'})"
docker compose --env-file .env.official -f compose.official.yaml up -d --wait mysql
npm.cmd run db:official:init
npm.cmd run build
npm.cmd run start:official -w backend
```

Em outro terminal, inicie o React:

```powershell
npm.cmd run dev:official -w frontend
```

Com a API e o React em execução, rode `npm.cmd run provision:official-password -w backend -- F0001` em um terceiro terminal. Depois, abra o React em http://127.0.0.1:5176/. Digite a nova senha somente nos prompts ocultos. Use `npm.cmd run check:official -w backend` para verificar a conexão e os privilégios.

Se a porta estiver ocupada, confirme qual serviço está escutando. A porta MySQL é configurável, mas o CLI de F0001 foi deliberadamente limitado a 3307. Use a porta padrão para provisionar pelo CLI. Um HTTP 503 em ready indica problema de conexão ou configuração. Se o instalador informar que o schema existe, confira o volume e use a reinicialização normal. Para backup, restauração e instalação em volume isolado, consulte [o guia do banco](database/README.md) e [a restauração](docs/restauracao.md).
## Continuar o desenvolvimento em outro computador

Depois que o commit estiver publicado no repositório da aplicação, clone o destino e a branch informados no relatório de publicação:

```powershell
git clone --branch <branch-da-aplicacao> <url-do-repositorio-da-aplicacao>
cd <pasta-clonada>
npm.cmd ci
```

O Git já contém a versão fixada do SQL oficial em `database/official/`. Este projeto não usa submódulos.

Para uma **instalação acadêmica**, siga [Como acessar o sistema — Credenciais acadêmicas](#como-acessar-o-sistema--credenciais-acadêmicas).

Para **recuperar o estado atual**, transfira o backup cifrado e a chave por canais privados separados e siga [a restauração do backup cifrado](docs/restauracao.md#restaurar-o-backup-oficial-cifrado). A recuperação preserva os registros acrescentados durante o desenvolvimento e a credencial bcrypt de F0001. Gere novas configurações locais e reconfira `npm.cmd run check:official -w backend` e `/api/v1/ready`.

Os fluxos administrativos do R03.2 foram validados no React oficial. As evidências complementares ainda pendentes estão na [validação do banco](docs/validacao-banco.md).
