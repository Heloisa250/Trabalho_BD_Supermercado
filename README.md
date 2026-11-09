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


## Administração no ambiente oficial

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

Para uma **instalação limpa**, siga a seção anterior. Ela cria novos segredos locais, sobe o Compose, importa os 98 registros oficiais e permite escolher a senha de F0001 no terminal. Em seguida, inicie a API com `npm.cmd run start:official -w backend` e o React com `npm.cmd run dev:official -w frontend`.

Para **recuperar o estado atual**, transfira o backup cifrado e a chave por canais privados separados e siga [a restauração do backup cifrado](docs/restauracao.md#restaurar-o-backup-oficial-cifrado). A recuperação preserva os registros acrescentados durante o desenvolvimento e a credencial bcrypt de F0001. Gere novas configurações locais e reconfira `npm.cmd run check:official -w backend` e `/api/v1/ready`.

O R03.2 ainda aguarda validação visual. Depois de recuperar o ambiente, entre no React oficial em http://127.0.0.1:5176/ e siga o [roteiro de administração](docs/r03-admin-oficial.md) quando iniciar essa etapa.