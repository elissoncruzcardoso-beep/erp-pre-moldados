param(
  [string]$EnvFile = ".env",
  [string]$OutputDir = "",
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
Require-Command -Name "aws"

$databaseUrl = $env:BACKUP_DATABASE_URL
if (-not $databaseUrl) { $databaseUrl = $env:DIRECT_URL }
if (-not $databaseUrl) { $databaseUrl = $env:DATABASE_URL }
if (-not $databaseUrl) { throw "Configure BACKUP_DATABASE_URL, DIRECT_URL ou DATABASE_URL." }

$bucket = $env:BACKUP_S3_BUCKET
if (-not $bucket) { throw "Configure BACKUP_S3_BUCKET." }

$prefix = $env:BACKUP_S3_PREFIX
if (-not $prefix) { $prefix = "precast-erp/postgres" }

$region = $env:AWS_REGION
$kmsKeyId = $env:BACKUP_S3_KMS_KEY_ID

if (-not $OutputDir) {
  $OutputDir = Join-Path $env:TEMP "precast-erp-backups"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$baseName = "precast-erp-full-$timestamp"
$dumpPath = Join-Path $OutputDir "$baseName.dump"
$shaPath = Join-Path $OutputDir "$baseName.sha256"

Write-Host "Iniciando backup completo logico do PostgreSQL..."

& pg_dump `
  --dbname $databaseUrl `
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

$s3Base = "s3://$bucket/$prefix/full/$((Get-Date).ToUniversalTime().ToString('yyyy/MM/dd'))"
$s3Dump = "$s3Base/$(Split-Path -Leaf $dumpPath)"
$s3Sha = "$s3Base/$(Split-Path -Leaf $shaPath)"

$awsArgs = @("s3", "cp", $dumpPath, $s3Dump, "--only-show-errors", "--storage-class", "STANDARD_IA")
if ($region) { $awsArgs += @("--region", $region) }
if ($kmsKeyId) {
  $awsArgs += @("--sse", "aws:kms", "--sse-kms-key-id", $kmsKeyId)
} else {
  $awsArgs += @("--sse", "AES256")
}

& aws @awsArgs
if ($LASTEXITCODE -ne 0) {
  throw "Upload do dump para S3 falhou com codigo $LASTEXITCODE."
}

$awsShaArgs = @("s3", "cp", $shaPath, $s3Sha, "--only-show-errors", "--storage-class", "STANDARD_IA")
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

Write-Host "Backup enviado para $s3Dump"
Write-Host "Checksum SHA256: $hash"

if (-not $KeepLocal -and $env:BACKUP_KEEP_LOCAL -ne "true") {
  Remove-Item -LiteralPath $dumpPath -Force
  Remove-Item -LiteralPath $shaPath -Force
  Write-Host "Copia local temporaria removida."
}

