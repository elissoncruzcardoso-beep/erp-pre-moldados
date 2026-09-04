param(
  [string]$EnvFile = ".env",
  [string]$OutputDir = "",
  [string]$EvidencePath = "docs/security/backups/latest.json",
  [string]$Operator = "",
  [switch]$KeepLocal
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) {
      return
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")

    if ($name -and -not [Environment]::GetEnvironmentVariable($name)) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando '$Name' nao encontrado no PATH. Instale antes de rodar o backup."
  }
}

Read-DotEnv -Path $EnvFile

Require-Command -Name "pg_dump"

$databaseUrl = $env:BACKUP_DATABASE_URL
if (-not $databaseUrl) { $databaseUrl = $env:DIRECT_URL }
if (-not $databaseUrl) { $databaseUrl = $env:DATABASE_URL }
if (-not $databaseUrl) { throw "Configure BACKUP_DATABASE_URL, DIRECT_URL ou DATABASE_URL." }

$databaseSchema = $env:BACKUP_DATABASE_SCHEMA
if (-not $databaseSchema) { $databaseSchema = "public" }
if ($databaseSchema -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') {
  throw "BACKUP_DATABASE_SCHEMA invalido. Use apenas letras, numeros e sublinhado."
}

$storageMode = $env:BACKUP_STORAGE_MODE
if (-not $storageMode) { $storageMode = "s3" }
$storageMode = $storageMode.Trim().ToLowerInvariant()

if (-not $OutputDir) {
  if ($storageMode -eq "local") {
    $OutputDir = $env:BACKUP_LOCAL_DIR
    if (-not $OutputDir) { throw "Configure BACKUP_LOCAL_DIR para BACKUP_STORAGE_MODE=local." }
  } else {
    $OutputDir = Join-Path $env:TEMP "precast-erp-backups"
  }
}

if ($storageMode -eq "local") {
  $OutputDir = Join-Path $OutputDir "full\$((Get-Date).ToUniversalTime().ToString('yyyy\\MM\\dd'))"
}

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$baseName = "precast-erp-full-$timestamp"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$dumpPath = Join-Path $OutputDir "$baseName.dump"
$shaPath = Join-Path $OutputDir "$baseName.sha256"

Write-Host "Iniciando backup completo logico do PostgreSQL..."

& pg_dump `
  --dbname $databaseUrl `
  --schema $databaseSchema `
  --format custom `
  --compress 9 `
  --no-owner `
  --no-privileges `
  --file $dumpPath

if ($LASTEXITCODE -ne 0) {
  throw "pg_dump falhou com codigo $LASTEXITCODE."
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath).Hash.ToLowerInvariant()
"$hash  $(Split-Path -Leaf $dumpPath)" | Set-Content -LiteralPath $shaPath -Encoding ASCII
$dumpSize = (Get-Item -LiteralPath $dumpPath).Length

if ($storageMode -eq "local") {
  $backupDestination = $dumpPath
  $checksumDestination = $shaPath
  $encryption = "local-managed"
  Write-Host "Backup gravado em $backupDestination"
} elseif ($storageMode -eq "s3") {
  Require-Command -Name "aws"

  $bucket = $env:BACKUP_S3_BUCKET
  if (-not $bucket) { throw "Configure BACKUP_S3_BUCKET." }

  $prefix = $env:BACKUP_S3_PREFIX
  if (-not $prefix) { $prefix = "precast-erp/postgres" }

  $region = $env:AWS_REGION
  $kmsKeyId = $env:BACKUP_S3_KMS_KEY_ID

  $s3Base = "s3://$bucket/$prefix/full/$((Get-Date).ToUniversalTime().ToString('yyyy/MM/dd'))"
  $backupDestination = "$s3Base/$(Split-Path -Leaf $dumpPath)"
  $checksumDestination = "$s3Base/$(Split-Path -Leaf $shaPath)"

  $awsArgs = @("s3", "cp", $dumpPath, $backupDestination, "--only-show-errors", "--storage-class", "STANDARD_IA")
  if ($region) { $awsArgs += @("--region", $region) }
  if ($kmsKeyId) {
    $awsArgs += @("--sse", "aws:kms", "--sse-kms-key-id", $kmsKeyId)
    $encryption = "aws:kms"
  } else {
    $awsArgs += @("--sse", "AES256")
    $encryption = "AES256"
  }

  & aws @awsArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Upload do dump para S3 falhou com codigo $LASTEXITCODE."
  }

  $awsShaArgs = @("s3", "cp", $shaPath, $checksumDestination, "--only-show-errors", "--storage-class", "STANDARD_IA")
  if ($region) { $awsShaArgs += @("--region", $region) }
  if ($kmsKeyId) {
    $awsShaArgs += @("--sse", "aws:kms", "--sse-kms-key-id", $kmsKeyId)
  } else {
    $awsShaArgs += @("--sse", "AES256")
  }

  & aws @awsShaArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Upload do checksum para S3 falhou com codigo $LASTEXITCODE."
  }

  Write-Host "Backup enviado para $backupDestination"
} else {
  throw "BACKUP_STORAGE_MODE invalido. Use local ou s3."
}

Write-Host "Checksum SHA256: $hash"

if (-not $Operator) {
  $Operator = $env:BACKUP_OPERATOR
}
if (-not $Operator) {
  $Operator = $env:USERNAME
}
if (-not $Operator) {
  $Operator = "Operador backup"
}

if ([System.IO.Path]::IsPathRooted($EvidencePath)) {
  $evidenceFullPath = $EvidencePath
} else {
  $evidenceFullPath = Join-Path (Get-Location).Path $EvidencePath
}
$evidenceDir = Split-Path -Parent $evidenceFullPath
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$evidence = [ordered]@{
  schemaVersion = 1
  performedAt = (Get-Date).ToUniversalTime().ToString("o")
  operator = $Operator
  type = "full-logical-backup"
  databaseSchema = $databaseSchema
  storageMode = $storageMode
  destination = $backupDestination
  checksumUri = $checksumDestination
  checksumSha256 = $hash
  sizeBytes = [int64]$dumpSize
  encryption = $encryption
  result = "PASS"
}

$evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $evidenceFullPath -Encoding UTF8
Write-Host "Evidencia segura gravada em: $EvidencePath"

if ($storageMode -eq "s3" -and -not $KeepLocal -and $env:BACKUP_KEEP_LOCAL -ne "true") {
  Remove-Item -LiteralPath $dumpPath -Force
  Remove-Item -LiteralPath $shaPath -Force
  Write-Host "Copia local temporaria removida."
}
