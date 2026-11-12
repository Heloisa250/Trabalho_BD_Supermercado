> Documento do ambiente legado. Para o schema oficial, consulte [Banco oficial](banco-oficial.md).

# MySQL de desenvolvimento

1. Abra o Docker Desktop com containers Linux. Confirme que `docker info` funciona e consulte `docker ps -a` antes de iniciar o serviço.
2. Copie `.env.example` para `.env` na raiz e defina uma senha administrativa forte. Se a porta 3306 estiver ocupada, ajuste `MYSQL_HOST_PORT` e use a mesma porta em `backend/.env`. Ambos os arquivos com credenciais são ignorados pelo Git.
3. Execute `docker compose up -d --wait mysql` e `docker compose ps mysql`. O volume nomeado preserva os dados ao parar e reiniciar com `docker compose stop mysql` e `docker compose up -d --wait mysql`. O health check verifica o processo MySQL. O endpoint da aplicação verifica acesso ao schema.
4. Confirme o SHA-256 do SQL com `certutil -hashfile sqlSupermercado2.sql SHA256`. O valor esperado é `852f952239a8a096f99e3da0964c503099799fab483b47b301cf96386c3b734a`.

## Importação após autorização

Use somente a instância nova e isolada. Confira a versão e a ausência do schema com:

```sh
docker compose exec mysql mysql -uroot -p -e "SELECT VERSION(); SHOW DATABASES LIKE 'supermercado';"
```

Se o schema já existir, pare e identifique a origem antes de prosseguir. Se estiver ausente e a importação tiver sido autorizada, execute:

```sh
docker compose exec mysql sh -c 'mysql -uroot -p --default-character-set=utf8mb4 < /sqlSupermercado2.sql'
```

O comando lê os bytes do arquivo montado em modo somente leitura. Digite a senha administrativa no prompt. Se houver erro, preserve a mensagem e pare. DDL pode ter sido aplicado parcialmente. A análise estática é compatível com os modos SQL e índices visíveis do MySQL 8.4, com confirmação definitiva condicionada à importação. [Modos SQL](https://dev.mysql.com/doc/refman/8.4/en/faqs-sql-modes.html) · [CREATE TABLE](https://dev.mysql.com/doc/refman/8.4/en/create-table.html)

## Conta de aplicação e validação

Após a importação, abra `docker compose exec mysql mysql -uroot -p`. Execute como administrador, substituindo o marcador por uma senha forte exclusiva, sem compartilhar a senha:

```sql
CREATE USER 'supermercado_app'@'%' IDENTIFIED BY '<senha exclusiva>';
GRANT SELECT ON supermercado.* TO 'supermercado_app'@'%';
```

A conta fica em uma instância isolada com porta publicada apenas em loopback. Copie `backend/.env.example` para `backend/.env`, defina `DB_HOST=127.0.0.1`, `DB_PORT` igual a `MYSQL_HOST_PORT`, `DB_USER=supermercado_app` e a senha correspondente. Reinicie o backend.

Conecte-se com a conta de aplicação pelo cliente MySQL e execute:

```sql
SELECT VERSION(), CURRENT_USER(), DATABASE();
SHOW GRANTS;
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'supermercado' AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'supermercado' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
ORDER BY TABLE_NAME, CONSTRAINT_NAME;
SELECT TABLE_NAME, COLUMN_NAME, EXTRA, GENERATION_EXPRESSION
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'supermercado' AND GENERATION_EXPRESSION <> ''
ORDER BY TABLE_NAME, COLUMN_NAME;
SELECT id_produto FROM supermercado.produto LIMIT 1;
```

Compare os nomes das 19 tabelas, as 25 chaves estrangeiras e as duas colunas geradas (`item_venda.subtotal` e `pagamento.troco`) com [a auditoria](analise-banco.md). Uma consulta ao produto pode retornar zero linhas em uma base nova. Verifique `GET http://127.0.0.1:3001/api/v1/ready` e abra http://127.0.0.1:5175/.

Sem Docker Engine, use uma instalação dedicada do MySQL 8.4 provisionada para desenvolvimento. Confirme a versão e a ausência do schema, importe o arquivo original pelo cliente MySQL em modo batch somente após autorização e aplique as mesmas verificações. Na instalação local, use uma conta limitada ao host local em vez de `%`.
