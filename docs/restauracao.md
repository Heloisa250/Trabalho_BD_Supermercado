# Recuperação do projeto

> Para levar o **estado atual completo** do banco oficial a outro computador, use o [TRANSFER-01](transfer-01.md). As seções abaixo descrevem os backups anteriores (R02/R031).

O código, os arquivos SQL oficiais e os dois arquivos Compose fazem parte do Git. Os volumes do Docker ficam na máquina onde o Docker roda. Para recuperar os dados atuais em outra máquina, copie também a pasta local `backups/` por um meio privado. Os dumps incluem dados de funcionários e hashes de senha. A pasta é ignorada pelo Git.

- `backups/supermercado-legado-r02.sql` restaura o schema `supermercado`, normalmente publicado na porta 3306.
- `backups/supermercado-oficial-r02.sql` restaura o schema `Supermercado`, normalmente publicado na porta 3307. Inclui a credencial bcrypt já provisionada para F0001.
- Preserve também uma cópia privada dos arquivos locais de configuração que você usa. As contas MySQL e seus privilégios pertencem ao servidor e ficam fora dos dumps de schema. Recrie as contas dedicadas no destino com os privilégios descritos nos guias, e configure as credenciais e segredos locais.

## Restauração em destino novo

1. Na nova máquina, clone o projeto, execute `npm ci` e configure os arquivos de ambiente locais. Os serviços Docker usam `.env` e `.env.official` na raiz. As APIs usam os arquivos correspondentes em `backend/`.
2. Suba a instância desejada pelo Compose com um volume novo. Confirme o nome do container e a ausência do schema de destino. Os dumps incluem a criação do schema e das tabelas. Pule qualquer importação separada de DDL ou DML ao usar o dump.
3. Copie o dump para o container e execute o cliente MySQL no próprio container. Para a instância oficial, em PowerShell:

```powershell
$opt = @('--env-file', '.env.official', '-f', 'compose.official.yaml')
$id = docker compose @opt ps -q mysql
docker cp .\backups\supermercado-oficial-r02.sql "${id}:/tmp/sqlider-restore.sql"
docker compose @opt exec mysql sh -c 'mysql -uroot -p < /tmp/sqlider-restore.sql'
```

Digite a senha administrativa no prompt. Interrompa se algum comando falhar. Para o legado, use o Compose padrão e o dump legado. Use somente volumes novos, pois o dump contém instruções de substituição de tabelas.

4. Recrie a conta de aplicação com os privilégios necessários. Para o ambiente oficial até R02, siga [R01](r01-infraestrutura.md), defina `ADMIN_MATRICULAS=F0001` no perfil oficial e use um segredo JWT novo. A senha de login do funcionário é validada pelo hash restaurado no dump.
5. Confira as tabelas e contagens, rode `npm run build` e teste `/api/v1/ready` e o login antes de usar a instância restaurada.

## Restaurar o backup oficial cifrado

Transfira o arquivo `supermercado-oficial-r031.sql.enc` por canal privado e entregue a chave por outro canal. O Git não contém nenhum dos dois. Na raiz do projeto, coloque o arquivo cifrado em `backups/` e a chave em `.env.backup-key-r031`. Crie a pasta se necessário. Verifique o SHA-256 do arquivo cifrado:

```powershell
Get-FileHash .\backups\supermercado-oficial-r031.sql.enc -Algorithm SHA256
node scripts/restore-snapshot.mjs decrypt backups/supermercado-oficial-r031.sql.enc .env.backup-key-r031 backups/supermercado-recuperado.sql
Get-FileHash .\backups\supermercado-recuperado.sql -Algorithm SHA256
```

O SHA-256 cifrado esperado é `256e0c0da5e6f2aa6053749f4695c87e88493f0e69d6e73d7d97855f2373eebf`. O SHA-256 do dump original é `98e3d45c9eb99b67d55e129fe3055b846f19ac17f67385ad91f862ca60d33d74`.

Crie o perfil raiz do Compose conforme o README, inicie o MySQL oficial em um **volume novo** e confirme que o schema `Supermercado` está ausente antes de restaurar. O dump contém DDL e dados, inclusive comandos de substituição de tabelas.

```powershell
$opt = @('--env-file', '.env.official', '-f', 'compose.official.yaml')
docker compose @opt up -d --wait mysql
docker compose @opt exec mysql mysql -uroot -p -e "SHOW DATABASES LIKE 'Supermercado';"
```

Somente se a consulta não retornar o schema, execute:

```powershell
$id = docker compose @opt ps -q mysql
docker cp .\backups\supermercado-recuperado.sql "${id}:/tmp/sqlider-restore.sql"
docker compose @opt exec mysql sh -c 'mysql -uroot -p --batch --default-character-set=utf8mb4 < /tmp/sqlider-restore.sql'
npm.cmd run db:official:init -- restored
npm.cmd run check:official -w backend
```

O modo `restored` valida a estrutura e recria apenas contas e perfis locais. Use os comandos de build e inicialização do README. O login F0001 usa a senha já configurada antes do backup. Preserve os arquivos recuperados em local privado.