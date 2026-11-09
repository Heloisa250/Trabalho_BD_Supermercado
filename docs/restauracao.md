# Recuperação do projeto

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
