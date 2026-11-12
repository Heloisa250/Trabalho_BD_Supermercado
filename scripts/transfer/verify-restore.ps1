<#
.SYNOPSIS
  Ensaio de restauração: importa um dump do Supermercado em um MySQL 8.4 TEMPORÁRIO e ISOLADO e compara com o manifesto.
.DESCRIPTION
  Cria um container e um volume próprios (prefixo "sqlider-transfer-verify"), em outra porta, sem montagem dos
  arquivos oficiais e sem scripts de inicialização: o DDL/DML oficial nunca é carregado. Restaura o dump e compara
  estrutura, contagens, CHECKSUM TABLE de cada tabela e órfãos de FK com o manifesto. No fim remove somente os
  recursos do ensaio. Não toca na instância oficial nem em outros volumes.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/transfer/verify-restore.ps1 -Dump backups\x.sql -Manifest backups\x.manifest.json
#>
param(
  [Parameter(Mandatory)] [string]$Dump,
  [Parameter(Mandatory)] [string]$Manifest,
  [int]$Port = 3321
)
. "$PSScriptRoot/common.ps1"

$expected = Get-Content -Raw -Encoding UTF8 $Manifest | ConvertFrom-Json
$name = 'sqlider-transfer-verify-' + (Get-Date -Format 'yyyyMMddHHmmss')
$volume = $name + '-data'
$created = $false
try {
  Write-Host "Ensaio isolado: container $name, volume $volume, porta 127.0.0.1:$Port."
  # Senha aleatória do ensaio, passada ao container por variável de ambiente (só o NOME vai na linha de comando).
  $env:MYSQL_ROOT_PASSWORD = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
  Invoke-Docker @('run', '-d', '--name', $name, '-e', 'MYSQL_ROOT_PASSWORD', '-v', "${volume}:/var/lib/mysql",
    '-p', "127.0.0.1:${Port}:3306", '--label', 'sqlider.purpose=transfer-verify', 'mysql:8.4.13') 'Criação do container de ensaio' | Out-Null
  $created = $true
  Remove-Item Env:MYSQL_ROOT_PASSWORD
  for ($i = 0; $i -lt 60; $i++) {
    # TCP, como o healthcheck do Compose: o servidor temporário da inicialização não aceita rede.
    & docker exec $name sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin --protocol=tcp -h 127.0.0.1 -uroot ping --silent' *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 2
  }
  if (((Invoke-MySql $name "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='Supermercado';") -join '') -ne '0') {
    throw 'A instância de ensaio não está vazia.'
  }
  # Cópia binária do dump para o container e importação pelo cliente do próprio container.
  Invoke-Docker @('cp', (Resolve-Path $Dump).Path, "${name}:/tmp/restore.sql") 'Cópia do dump' | Out-Null
  & docker exec $name sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --default-character-set=utf8mb4 < /tmp/restore.sql' 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Importação do dump falhou.' }

  $state = Get-SchemaState $name
  $problems = @()
  if ($state.Structure -ne $expected.estrutura) { $problems += "estrutura $($state.Structure) <> $($expected.estrutura)" }
  if ($state.Orphans -ne 0) { $problems += "$($state.Orphans) registro(s) órfão(s) de FK" }
  foreach ($table in $Script:Tables) {
    if ($state.Counts[$table] -ne $expected.contagens.$table) { $problems += "contagem de $table" }
    if ($state.Checksums[$table] -ne $expected.checksums.$table) { $problems += "checksum de $table" }
  }
  Write-Host ("Restaurado: estrutura {0}, {1} colunas de FK verificadas, {2} registros, órfãos {3}." -f $state.Structure, $state.ForeignKeys, $state.Total, $state.Orphans)
  foreach ($table in $Script:Tables) { Write-Host ("  {0,-22} {1,5}  checksum {2}" -f $table, $state.Counts[$table], ($(if ($state.Checksums[$table] -eq $expected.checksums.$table) { 'igual' } else { 'DIFERENTE' }))) }
  if ($problems) { throw ('Restauração divergente: ' + ($problems -join '; ')) }
  Write-Host 'RESTAURAÇÃO ISOLADA APROVADA: todas as tabelas idênticas à origem.'
} finally {
  if ($created) {
    & docker rm -f $name *> $null
    & docker volume rm $volume *> $null
    Write-Host "Recursos do ensaio removidos ($name, $volume)."
  }
  if (Test-Path Env:MYSQL_ROOT_PASSWORD) { Remove-Item Env:MYSQL_ROOT_PASSWORD }
}
