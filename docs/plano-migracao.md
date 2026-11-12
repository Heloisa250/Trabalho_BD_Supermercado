# Plano de migração

O legado usa o container `supermercado-qualidade-lider-dev-mysql-1`, porta `127.0.0.1:3306`, volume `supermercado-qualidade-lider-dev_mysql-data` em `/var/lib/mysql` e schema `supermercado`. O `backend/.env` ativo contém a credencial da conta de aplicação legada. Os segredos ficam fora da documentação.

O backup lógico `backups/supermercado-legado-r00.sql` tem 25.279 bytes e SHA-256 `f51d577dbef54575ef7c28cab082057e0b35ece271be67f14d9a2a12579ff4fd`. Foi gerado com `mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF --routines --events --triggers --databases supermercado`. O arquivo tem as 19 definições de tabela e o marcador de conclusão. A pasta está ignorada no Git. Uma restauração de ensaio em destino descartável ainda precisa ser executada antes de depender desse backup para recuperação.

A instância oficial usa `compose.official.yaml`, projeto Docker `supermercado-qualidade-lider-oficial-dev`, volume próprio `supermercado-qualidade-lider-oficial-dev_mysql-oficial-data` e porta local 3307. Os arquivos oficiais são montados somente para leitura. A configuração administrativa fica em `.env.official`, ignorado pelo Git.

```sh
docker compose --env-file .env.official -f compose.official.yaml up -d --wait mysql
docker compose --env-file .env.official -f compose.official.yaml ps mysql
```

O destino para a estrutura é `Supermercado`, com inicial maiúscula. Antes de importar o DDL, confirme o nome do container, o hash do arquivo montado e a ausência do schema. Use o cliente MySQL em modo batch e interrompa no primeiro erro. Para dados demonstrativos, obtenha autorização específica, confirme que todas as tabelas estão vazias e registre contagens antes e depois. Faça uma execução única do DML no destino oficial. Se falhar, preserve a evidência e investigue o estado parcial.

R01 prepara a conta dedicada e a configuração paralela para testar conectividade. R02 a R04 validam módulos contra a nova base. A troca definitiva do destino ocorre somente após aprovação dos testes pertinentes. O retorno usa a configuração anterior e o volume legado. Registros produzidos nos dois ambientes têm histórias independentes e não devem ser combinados automaticamente.
