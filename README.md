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
