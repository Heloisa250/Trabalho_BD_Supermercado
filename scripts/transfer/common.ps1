# Funções compartilhadas do TRANSFER-01 (Windows PowerShell 5.1+).
# Nenhuma senha passa pela linha de comando do host: o cliente MySQL roda DENTRO do container e lê a
# senha de root da variável de ambiente do próprio container (MYSQL_ROOT_PASSWORD -> MYSQL_PWD).
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3

$Script:Tables = @('caixa','cargo','forma_pagamento','marca','categoria','fornecedor','funcionario','produto',
  'sessao_caixa','venda','item_venda','pagamento','nota_fiscal','pedido_compra','produto_fornecedor',
  'item_pedido_compra','lote','movimentacao_estoque','cancelamento_item')
$Script:OfficialHashes = @{
  'Supermercado_ddl.sql' = 'd5227f6e5259da79f157d88b79a9d44df437025e3ba99357a754924c603c1308'
  'Supermercado_dml.sql' = '0da3145472fdfa9f13ed89c467045d04c66db8027dd0691dbf6638a215960cd8'
}

function Invoke-Docker([string[]]$Arguments, [string]$Label) {
  # PowerShell 5.1 trata linhas de stderr de programas nativos como erro; o Compose escreve progresso em stderr.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = & docker @Arguments 2>&1 } finally { $ErrorActionPreference = $previous }
  if ($LASTEXITCODE -ne 0) { throw "$Label falhou (docker $($Arguments[0])): " + (($output | Select-Object -Last 3) -join ' ') }
  return ($output | ForEach-Object { "$_" }) -join "`n"
}

# Executa SQL como root dentro do container; retorna linhas em modo batch (-NB).
function Invoke-MySql([string]$Container, [string]$Query) {
  $output = $Query | & docker exec -i $Container sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -NB --default-character-set=utf8mb4' 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Consulta MySQL falhou em $Container." }
  return @($output | ForEach-Object { "$_" })
}

function Assert-OfficialSqlFiles([string]$Root) {
  foreach ($file in $Script:OfficialHashes.Keys) {
    $hash = (Get-FileHash -Algorithm SHA256 (Join-Path $Root "database/official/$file")).Hash.ToLower()
    if ($hash -ne $Script:OfficialHashes[$file]) { throw "Arquivo oficial alterado: $file" }
  }
}

# Estado determinístico do schema: contagem e CHECKSUM TABLE por tabela (compara todos os valores,
# inclusive hashes de senha, sem exibi-los), mais estrutura e órfãos de FK.
function Get-SchemaState([string]$Container) {
  $structure = Invoke-MySql $Container @"
SELECT CONCAT((SELECT COUNT(*) FROM information_schema.TABLES WHERE BINARY TABLE_SCHEMA='Supermercado' AND ENGINE='InnoDB'),':',
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE BINARY TABLE_SCHEMA='Supermercado'),':',
 (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE BINARY TABLE_SCHEMA='Supermercado' AND CONSTRAINT_TYPE='FOREIGN KEY'));
"@
  $counts = [ordered]@{}
  $union = ($Script:Tables | ForEach-Object { "SELECT '$_',COUNT(*) FROM Supermercado.$_" }) -join ' UNION ALL '
  foreach ($line in (Invoke-MySql $Container "$union;")) { $parts = $line -split "`t"; $counts[$parts[0]] = [int]$parts[1] }
  $checksums = [ordered]@{}
  $list = ($Script:Tables | ForEach-Object { "Supermercado.$_" }) -join ','
  foreach ($line in (Invoke-MySql $Container "CHECKSUM TABLE $list EXTENDED;")) { $parts = $line -split "`t"; $checksums[$parts[0] -replace '^Supermercado\.', ''] = $parts[1] }
  # Órfãos: para cada FK, filhos cujo pai não existe (deve ser 0 em todas).
  $fks = Invoke-MySql $Container @"
SELECT CONCAT('SELECT ''',k.TABLE_NAME,'.',k.COLUMN_NAME,''',COUNT(*) FROM Supermercado.',k.TABLE_NAME,' c LEFT JOIN Supermercado.',
 k.REFERENCED_TABLE_NAME,' p ON p.',k.REFERENCED_COLUMN_NAME,'=c.',k.COLUMN_NAME,' WHERE c.',k.COLUMN_NAME,' IS NOT NULL AND p.',k.REFERENCED_COLUMN_NAME,' IS NULL')
FROM information_schema.KEY_COLUMN_USAGE k WHERE BINARY k.TABLE_SCHEMA='Supermercado' AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.COLUMN_NAME;
"@
  $orphans = 0
  foreach ($line in (Invoke-MySql $Container (($fks -join ' UNION ALL ') + ';'))) { $orphans += [int](($line -split "`t")[1]) }
  [pscustomobject]@{ Structure = ($structure -join ''); Counts = $counts; Checksums = $checksums; Orphans = $orphans; ForeignKeys = $fks.Count
    Total = ($counts.Values | Measure-Object -Sum).Sum }
}
