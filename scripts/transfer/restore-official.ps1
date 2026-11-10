<#
.SYNOPSIS
  TRANSFER-01: restaura o backup cifrado do Supermercado em uma instância oficial NOVA (outro computador).
.DESCRIPTION
  1. Confere o SHA-256 do arquivo cifrado com o manifesto.
  2. Sobe o MySQL oficial pelo Compose (o DDL/DML fica montado em /official e NÃO é importado automaticamente).
  3. PARA se o schema Supermercado já existir: nunca sobrescreve nem executa DROP.
  4. Descriptografa (AES-256-GCM autenticado), confere o SHA-256 do dump, importa dentro do container.
  5. Compara estrutura, contagens, CHECKSUM TABLE e FKs com o manifesto; apaga o texto puro.
  6. Recria as contas técnicas MySQL e os .env da API com segredos novos (provisionador, modo "restored").
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/transfer/restore-official.ps1 `
    -Encrypted backups\supermercado-oficial-transfer01-AAAAMMDD-HHMMSS.sql.enc `
    -Manifest  backups\supermercado-oficial-transfer01-AAAAMMDD-HHMMSS.manifest.json `
    -KeyFile   .env.backup-key-transfer01
#>
param(
  [Parameter(Mandatory)] [string]$Encrypted,
  [Parameter(Mandatory)] [string]$Manifest,
  [Parameter(Mandatory)] [string]$KeyFile,
  [switch]$SkipProvision,
  # Só para ensaios: outro projeto Compose e outros arquivos .env de destino.
  [string]$Project = 'supermercado-qualidade-lider-oficial-dev',
  [string]$ApiEnv = 'backend/.env.official',
  [string]$ProvisionEnv = 'backend/.env.r02-provision'
)
. "$PSScriptRoot/common.ps1"
$root = (Resolve-Path "$PSScriptRoot/../..").Path
Set-Location $root
$expected = Get-Content -Raw -Encoding UTF8 $Manifest | ConvertFrom-Json
$composeArgs = @('compose', '--env-file', '.env.official', '-f', 'compose.official.yaml', '-p', $Project)

Write-Host '== 1. Conferência do arquivo cifrado'
Assert-OfficialSqlFiles $root
$hash = (Get-FileHash -Algorithm SHA256 $Encrypted).Hash.ToLower()
if ($hash -ne $expected.cifrado.sha256) { throw "SHA-256 do arquivo cifrado não confere ($hash)." }
Write-Host "  SHA-256 confere: $hash"
if (-not (Test-Path '.env.official')) { throw 'Crie .env.official a partir de .env.official.example (MYSQL_ROOT_PASSWORD forte e local).' }

Write-Host '== 2. MySQL oficial (volume próprio do Compose)'
Invoke-Docker ($composeArgs + @('up', '-d', '--wait', 'mysql')) 'Inicialização do MySQL' | Out-Null
$container = (Invoke-Docker ($composeArgs + @('ps', '-q', 'mysql')) 'Identificação do container').Trim()
$schema = (Invoke-MySql $container "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE LOWER(SCHEMA_NAME)='supermercado';") -join ''
if ($schema -ne '0') {
  $rows = (Invoke-MySql $container "SELECT COALESCE(SUM(TABLE_ROWS),0) FROM information_schema.TABLES WHERE LOWER(TABLE_SCHEMA)='supermercado';") -join ''
  throw "Já existe um schema Supermercado nesta instância (~$rows registros estimados). Nada foi alterado. Restaure somente em volume novo, ou autorize explicitamente outra estratégia."
}

Write-Host '== 3. Descriptografia e importação'
$plain = Join-Path 'backups' ('restore-' + (Get-Date -Format 'yyyyMMddHHmmss') + '.sql')
try {
  & node scripts/restore-snapshot.mjs decrypt $Encrypted $KeyFile $plain
  if ($LASTEXITCODE -ne 0) { throw 'Descriptografia falhou (chave errada ou arquivo alterado).' }
  if ((Get-FileHash -Algorithm SHA256 $plain).Hash.ToLower() -ne $expected.dump.sha256) { throw 'SHA-256 do dump descriptografado não confere.' }
  Invoke-Docker @('cp', (Resolve-Path $plain).Path, "${container}:/tmp/restore.sql") 'Cópia do dump' | Out-Null
  & docker exec $container sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --default-character-set=utf8mb4 < /tmp/restore.sql; rc=$?; rm -f /tmp/restore.sql; exit $rc' 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Importação falhou.' }
} finally {
  if (Test-Path $plain) { Remove-Item $plain }
}

Write-Host '== 4. Conferência com o manifesto'
$state = Get-SchemaState $container
$problems = @()
if ($state.Structure -ne $expected.estrutura) { $problems += 'estrutura' }
if ($state.Orphans -ne 0) { $problems += 'órfãos de FK' }
foreach ($table in $Script:Tables) {
  if ($state.Counts[$table] -ne $expected.contagens.$table -or $state.Checksums[$table] -ne $expected.checksums.$table) { $problems += $table }
}
if ($problems) { throw ('Restauração divergente: ' + ($problems -join ', ')) }
Write-Host "  Aprovado: $($state.Total) registros em 19 tabelas, idênticos à origem (contagens e CHECKSUM TABLE)."

if (-not $SkipProvision) {
  Write-Host '== 5. Contas técnicas MySQL e perfis locais (segredos novos)'
  & npm.cmd run db:official:init -- restored $Project .env.official $ApiEnv $ProvisionEnv
  if ($LASTEXITCODE -ne 0) { throw 'Provisionamento falhou. Veja a mensagem acima.' }
}
Write-Host 'Pronto. Próximos passos: npm.cmd run build; iniciar a API oficial e o React (README).'
