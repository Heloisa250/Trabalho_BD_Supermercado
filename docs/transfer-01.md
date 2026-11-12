# TRANSFER-01 — Restaurar o Supermercado em outro computador

Leva o **estado completo e atual** do MySQL oficial (não só o DDL/DML iniciais) e o código para outra máquina.

| O que | Onde | Canal |
| --- | --- | --- |
| Código, scripts, testes, documentação | GitHub (branch da aplicação) | `git clone` |
| Banco completo cifrado `supermercado-oficial-transfer01-*.sql.enc` + manifesto `*.manifest.json` | pasta `backups/` (ignorada pelo Git) | pendrive / armazenamento privado |
| Chave `.env.backup-key-transfer01` (256 bits, AES-256-GCM) | raiz do projeto (ignorada pelo Git) | **outro** canal privado, separado do arquivo cifrado |

Nunca envie o dump, o arquivo cifrado ou a chave ao Git, e-mail aberto ou chat público. O dump contém dados de funcionários e hashes de senha.

## No computador atual (gerar o backup)

```powershell
cd "C:\Users\<você>\Desktop\Supermercado Qualidade Líder"
powershell -ExecutionPolicy Bypass -File scripts\transfer\backup-official.ps1
```

O script é somente leitura na instância oficial. Ele audita (container, porta 3307, volume, MySQL 8.4.13, 19 tabelas, 25 FKs, F0001/F0002 e formato dos hashes sem exibi-los), exporta com `mysqldump --single-transaction --quick --routines --triggers --events --no-tablespaces --set-gtid-purged=OFF --hex-blob` **dentro do container** (cópia binária por `docker cp`, sem redirecionamento do PowerShell e sem senha no host), confirma que nada mudou durante a exportação, cifra, testa a descriptografia, restaura numa instância **temporária e isolada** (outro container, volume e porta, sem o DDL/DML oficial), compara as 19 tabelas por contagem e `CHECKSUM TABLE`, grava o manifesto e apaga as cópias em texto puro. Para um ponto de consistência rigoroso, pare a API (porta 3002) antes de rodar; se houver escrita durante a exportação, o script aborta.

Copie para o novo computador: `backups\<nome>.sql.enc` e `backups\<nome>.manifest.json` por um canal, e `.env.backup-key-transfer01` por outro.

## No computador pessoal (restaurar)

Pré-requisitos: Git, Node.js 22+ (mesma major do computador atual), Docker Desktop em execução.

1. **Clonar e conferir o commit** (o hash publicado está no relatório do TRANSFER-01A):
   ```powershell
   git clone https://github.com/Heloisa250/Trabalho_BD_Supermercado.git "Supermercado Qualidade Líder"
   cd "Supermercado Qualidade Líder"
   git switch codex/aplicacao-r02
   git log -1 --oneline
   ```
2. **Dependências**: `npm.cmd ci`
3. **Arquivo do Docker**: copie `.env.official.example` para `.env.official` e defina uma `MYSQL_ROOT_PASSWORD` forte e **nova** (não reutilize a do computador do trabalho).
   ```powershell
   Copy-Item .env.official.example .env.official
   notepad .env.official
   ```
   Não crie `backend\.env.official` nem `backend\.env.r02-provision` à mão: o passo 6 cria os dois com segredos novos (senhas técnicas e `JWT_SECRET`).
4. **Transferir os arquivos**: crie `backups\` e coloque o `.sql.enc` e o `.manifest.json`; coloque a chave em `.env.backup-key-transfer01` na raiz.
5. **Conferir o SHA-256** (deve ser igual ao campo `cifrado.sha256` do manifesto e ao relatório):
   ```powershell
   Get-FileHash .\backups\supermercado-oficial-transfer01-<data>.sql.enc -Algorithm SHA256
   ```
6. **Restaurar** (sobe o MySQL oficial em volume novo, descriptografa, importa, compara com o manifesto e recria as contas técnicas):
   ```powershell
   $b = 'backups\supermercado-oficial-transfer01-<data>'
   powershell -ExecutionPolicy Bypass -File scripts\transfer\restore-official.ps1 -Encrypted "$b.sql.enc" -Manifest "$b.manifest.json" -KeyFile .env.backup-key-transfer01
   ```
   - O DDL/DML oficial fica montado em `/official` e **não** é importado automaticamente: o volume novo começa vazio e recebe só o backup.
   - **Se já existir um schema `Supermercado` com dados, o script para sem alterar nada.** Não use `DROP DATABASE`; peça autorização e decida antes (por exemplo, use outro nome de projeto Compose/volume).
   - As contas MySQL (`supermercado_r03_app`, `supermercado_r01`, `supermercado_r02_provision`) não fazem parte do schema; o provisionador as recria com os **mesmos privilégios** e senhas novas, e grava `backend\.env.official` (com `JWT_SECRET` novo e `ADMIN_MATRICULAS=F0001`) e `backend\.env.r02-provision`.
7. **Build, API e React**:
   ```powershell
   npm.cmd run build
   npm.cmd run check:official -w backend
   cd backend; npm.cmd run start:official      # API em http://127.0.0.1:3002
   # em outro terminal, na raiz:
   cd frontend; npm.cmd run dev:official       # React em http://127.0.0.1:5176
   ```
8. **Testar logins**: entre com **F0001** e a mesma senha usada no computador do trabalho (o hash bcrypt foi restaurado sem alteração). Entre com **F0002** em outro navegador ou depois de sair: o menu não mostra áreas administrativas, mas F0002 autoriza cancelamento de item no PDV (matrícula e senha na janela de autorização).
9. **Conferir os dados**: o script já comparou as 19 tabelas com o manifesto. Na interface: Dashboard (faturamento de 01/11 a 10/11 = R$ 281,14), venda nº 6 FINALIZADA, sessões 3 e 5 abertas.
10. **Continuar o desenvolvimento**: `npm.cmd test` (back-end e front-end), commits na branch da aplicação. Guarde o arquivo cifrado e a chave em local privado; apague cópias em texto puro.

## Configuração manual necessária no destino

- `.env.official` com uma senha root nova (passo 3).
- Copiar o arquivo cifrado, o manifesto e a chave (passo 4).
- Nada mais: senhas técnicas e `JWT_SECRET` são gerados pelo provisionador. As senhas dos funcionários continuam as mesmas.

## Scripts

| Script | Função |
| --- | --- |
| `scripts/transfer/backup-official.ps1` | Auditoria, exportação, criptografia, teste de descriptografia, ensaio isolado e manifesto. |
| `scripts/transfer/verify-restore.ps1` | Ensaio de restauração em container/volume/porta temporários; compara com o manifesto e remove os recursos do ensaio. |
| `scripts/transfer/restore-official.ps1` | Restauração no destino com conferência de SHA-256, proteção contra sobrescrita e provisionamento. |
| `scripts/transfer/common.ps1` | Funções comuns (consultas no container, contagens, `CHECKSUM TABLE`, órfãos de FK). |
| `scripts/restore-snapshot.mjs` | Criptografia AES-256-GCM (já existente no projeto). |
| `database/provisioning/initialize-official.mjs` | Contas MySQL e perfis locais (modo `restored`). |
