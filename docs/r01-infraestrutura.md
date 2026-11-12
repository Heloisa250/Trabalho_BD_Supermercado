# R01 — conexão paralela

A API legada usa `backend/.env`, porta 3001 e schema `supermercado`. A API paralela usa exclusivamente `backend/.env.official`, porta 3002 em loopback e schema `Supermercado`. A configuração oficial não herda credenciais do processo nem usa o arquivo legado como alternativa. O arquivo `.env.official` na raiz é do Compose e tem finalidade diferente.

Na raiz do projeto:

```sh
docker compose --env-file .env.official -f compose.official.yaml ps mysql
npm run build -w backend
npm run start:official -w backend
```

Use `http://127.0.0.1:3002/api/v1/health` e `http://127.0.0.1:3002/api/v1/ready`. O health verifica o processo. O ready consulta `DATABASE()` e exige a grafia exata do schema. Falhas de conexão ou de configuração retornam 503. O React legado continua na porta 5175.

## Conta de leitura após autorização

Destino exclusivo: container `supermercado-qualidade-lider-oficial-dev-mysql-1`, publicado em `127.0.0.1:3307`. A inspeção inicial encontrou apenas as contas internas e root. A conta proposta é `supermercado_r01`@'%'. O host '%' permite a conexão através da rede Docker. A publicação no host é restrita ao loopback.

Execute em sessão administrativa do container oficial somente após autorização explícita:

```sql
CREATE USER 'supermercado_r01'@'%' IDENTIFIED BY '<senha aleatória exclusiva>';
GRANT SELECT ON Supermercado.* TO 'supermercado_r01'@'%';
SHOW GRANTS FOR 'supermercado_r01'@'%';
```

Configure a senha em `backend/.env.official` e reinicie a API 3002. Execute `npm run check:official -w backend` para validar identidade, schema, 19 tabelas, 120 colunas, FKs, UNIQUEs, AUTO_INCREMENT, ausência de colunas geradas e os privilégios. Confirme que ready passa a retornar 200 enquanto a API 3001 continua respondendo.

A inspeção administrativa confirmou a estrutura oficial antes de criar a conta. Ela não equivale à validação com o pool da API. O banco oficial continua sem DML. As incompatibilidades de login, IDs, defaults, unidades, estados de compra e unicidade seguem na [matriz](comparacao-schemas.md).
