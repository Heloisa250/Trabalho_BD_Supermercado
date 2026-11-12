<#
.SYNOPSIS
  TRANSFER-01A: backup lógico INTEGRAL e cifrado do schema Supermercado da instância oficial, com manifesto,
  teste de descriptografia e ensaio de restauração isolado.
.DESCRIPTION
  1. Audita a instância (container, porta 3307, volume, versão, schema, 19 tabelas, 25 FKs, funcionários, hashes).
  2. Registra contagens e CHECKSUM TABLE de todas as tabelas.
  3. Gera o dump com mysqldump DENTRO do container e o copia com "docker cp" (binário, sem redirecionamento do
     PowerShell, sem senha no host).
  4. Confere que nada mudou durante a exportação (contagens e checksums iguais antes e depois).
  5. Cifra com AES-256-GCM (autenticada) via scripts/restore-snapshot.mjs; chave aleatória de 256 bits gravada
     em arquivo local ignorado pelo Git. Nenhuma senha é inventada nem digitada em linha de comando.
  6. Testa a descriptografia e compara o SHA-256 com o dump original.
  7. Restaura em instância temporária isolada (verify-restore.ps1) e compara tabela a tabela.
  8. Grava o manifesto (sem CPF, senha, hash ou dado pessoal) e apaga as cópias em texto puro.
  Somente leitura na instância oficial.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/transfer/backup-official.ps1
#>
param(
  [string]$Container = 'supermercado-qualidade-lider-oficial-dev-mysql-1',
  [string]$OutDir = 'backups',
  [string]$KeyFile = '.env.backup-key-transfer01'
)
. "$PSScriptRoot/common.ps1"
$root = (Resolve-Path "$PSScriptRoot/../..").Path
Set-Location $root
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$base = "supermercado-oficial-transfer01-$stamp"
New-Item -ItemType Directory -Force $OutDir | Out-Null
$plain = Join-Path $OutDir "$base.sql"
$encrypted = "$plain.enc"
$check = Join-Path $OutDir "$base.decrypt-check.sql"
if (Test-Path $KeyFile) { throw "O arquivo de chave $KeyFile já existe. Mova-o para local seguro ou informe -KeyFile." }

Write-Host '== 1. Auditoria da instância oficial'
Assert-OfficialSqlFiles $root
$inspect = (Invoke-Docker @('inspect', $Container) 'Inspeção do container') | ConvertFrom-Json
$image = $inspect[0].Config.Image
$bind = $inspect[0].NetworkSettings.Ports.'3306/tcp'[0]
$binding = $bind.HostIp + ':' + $bind.HostPort
$volume = ($inspect[0].Mounts | Where-Object { $_.Destination -eq '/var/lib/mysql' }).Name
$health = $inspect[0].State.Health.Status
if ($image -ne 'mysql:8.4.13' -or $binding -ne '127.0.0.1:3307' -or $health -ne 'healthy') { throw "Instância inesperada: $image $binding $health" }
$version = (Invoke-MySql $Container 'SELECT VERSION();') -join ''
if ((Invoke-MySql $Container "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE BINARY SCHEMA_NAME='Supermercado';") -join '' -ne 'Supermercado') { throw 'Schema Supermercado ausente.' }
$before = Get-SchemaState $Container
if ($before.Structure -ne '19:120:25') { throw "Estrutura inesperada: $($before.Structure)" }
if ($before.Orphans -ne 0) { throw 'Existem registros órfãos de FK na origem.' }
$people = Invoke-MySql $Container @'
SELECT f.matricula, f.ativo, c.pode_cancelar_item,
  CASE WHEN f.senha_hash REGEXP '^\\$2[aby]\\$[0-9]{2}\\$' THEN 'bcrypt' WHEN f.senha_hash REGEXP '^[0-9a-f]{64}$' THEN 'sha256-legado' ELSE 'outro' END
FROM Supermercado.funcionario f JOIN Supermercado.cargo c USING(id_cargo) WHERE f.matricula IN ('F0001','F0002') ORDER BY f.matricula;
'@
if ($people.Count -ne 2) { throw 'F0001 e F0002 precisam existir.' }
$sessions = Invoke-MySql $Container "SELECT id_sessao, IF(data_fechamento IS NULL,'ABERTA','FECHADA') FROM Supermercado.sessao_caixa ORDER BY id_sessao;"
$sales = Invoke-MySql $Container 'SELECT status, COUNT(*) FROM Supermercado.venda GROUP BY status ORDER BY status;'
Write-Host "  $Container | $image | $binding | volume $volume | MySQL $version | estrutura $($before.Structure) | $($before.Total) registros"

Write-Host '== 2. Exportação (mysqldump dentro do container)'
$dumpCmd = 'umask 077; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --quick --routines --triggers --events ' +
  '--no-tablespaces --set-gtid-purged=OFF --hex-blob --default-character-set=utf8mb4 --databases Supermercado --result-file=/tmp/transfer01.sql'
& docker exec $Container sh -c $dumpCmd 2>$null
if ($LASTEXITCODE -ne 0) { throw 'mysqldump falhou.' }
try {
  Invoke-Docker @('cp', "${Container}:/tmp/transfer01.sql", $plain) 'Cópia do dump' | Out-Null
} finally {
  & docker exec $Container rm -f /tmp/transfer01.sql *> $null
}
$tail = Get-Content $plain -Tail 3 -Encoding UTF8
if (-not ($tail -match '^-- Dump completed')) { throw 'Dump incompleto (rodapé ausente).' }
$after = Get-SchemaState $Container
foreach ($table in $Script:Tables) {
  if ($after.Counts[$table] -ne $before.Counts[$table] -or $after.Checksums[$table] -ne $before.Checksums[$table]) {
    throw "A tabela $table mudou durante a exportação. Pare as escritas da aplicação e repita."
  }
}
$plainHash = (Get-FileHash -Algorithm SHA256 $plain).Hash.ToLower()
Write-Host "  Dump completo: $((Get-Item $plain).Length) bytes, SHA-256 $plainHash. Origem inalterada durante a exportação."

$manifestPath = Join-Path $OutDir "$base.manifest.json"
$appCommit = (& git rev-parse HEAD).Trim()
$dirty = [bool](& git status --porcelain)
$manifest = [ordered]@{
  gerado_em = (Get-Date).ToString('o'); mysql = $version; schema = 'Supermercado'; container = $Container; volume = $volume
  commit_aplicacao = $appCommit; alteracoes_locais_nao_commitadas = $dirty; commit_sql_oficial = '4bb569c'
  arquivos_sql_oficiais = $Script:OfficialHashes; estrutura = $before.Structure; colunas_fk_verificadas = $before.ForeignKeys
  orfaos_fk = $before.Orphans; total_registros = $before.Total; contagens = $before.Counts; checksums = $before.Checksums
  funcionarios_chave = @($people | ForEach-Object { $p = $_ -split "`t"; [ordered]@{ matricula = $p[0]; ativo = [int]$p[1]; pode_cancelar_item = [int]$p[2]; formato_hash = $p[3] } })
  sessoes_caixa = @($sessions | ForEach-Object { $p = $_ -split "`t"; [ordered]@{ id_sessao = [int]$p[0]; situacao = $p[1] } })
  vendas_por_status = [ordered]@{}; dump = [ordered]@{ arquivo = Split-Path $plain -Leaf; bytes = (Get-Item $plain).Length; sha256 = $plainHash }
}
foreach ($line in $sales) { $p = $line -split "`t"; $manifest.vendas_por_status[$p[0]] = [int]$p[1] }

Write-Host '== 3. Criptografia autenticada (AES-256-GCM)'
& node scripts/restore-snapshot.mjs encrypt $plain $KeyFile $encrypted
if ($LASTEXITCODE -ne 0) { throw 'Criptografia falhou.' }
$encHash = (Get-FileHash -Algorithm SHA256 $encrypted).Hash.ToLower()
& node scripts/restore-snapshot.mjs decrypt $encrypted $KeyFile $check
if ($LASTEXITCODE -ne 0) { throw 'Descriptografia de teste falhou.' }
$checkHash = (Get-FileHash -Algorithm SHA256 $check).Hash.ToLower()
Remove-Item $check
if ($checkHash -ne $plainHash) { throw 'O arquivo descriptografado difere do dump original.' }
Write-Host "  Cifrado: $encrypted ($((Get-Item $encrypted).Length) bytes), SHA-256 $encHash. Descriptografia conferida."
$manifest.cifrado = [ordered]@{ arquivo = Split-Path $encrypted -Leaf; bytes = (Get-Item $encrypted).Length; sha256 = $encHash
  formato = 'AES-256-GCM (IV 12 bytes + tag 16 bytes + texto cifrado), chave aleatória de 256 bits em arquivo separado'
  teste_descriptografia = 'aprovado: SHA-256 igual ao dump original' }
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $manifestPath

Write-Host '== 4. Ensaio de restauração isolado'
try {
  & "$PSScriptRoot/verify-restore.ps1" -Dump $plain -Manifest $manifestPath
  $manifest.restauracao_isolada = 'aprovada: estrutura, contagens, CHECKSUM TABLE de 19 tabelas e FKs iguais à origem'
} catch {
  $manifest.restauracao_isolada = 'FALHOU: ' + $_.Exception.Message
  throw
} finally {
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $manifestPath
  # O texto puro contém hashes de senha e dados de funcionários: removido após a validação.
  if (Test-Path $plain) { Remove-Item $plain }
}
Write-Host ''
Write-Host "BACKUP PRONTO: $((Resolve-Path $encrypted).Path)"
Write-Host "Manifesto:     $((Resolve-Path $manifestPath).Path)"
Write-Host "Chave:         $((Resolve-Path $KeyFile).Path)  (transfira por OUTRO canal; nunca no Git)"
