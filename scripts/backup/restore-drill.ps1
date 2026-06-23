param(
  [string]$EnvFile = ".env",
  [string]$DumpPath = "",
  [string]$ChecksumPath = "",
  [string]$S3DumpUri = "",
  [string]$S3ChecksumUri = "",
  [string]$EvidencePath = "docs/security/restore-drills/latest.json",
  [string]$Operator = "",
  [string]$TargetDatabaseUrl = "",
  [switch]$SkipChecksum
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
    throw "Comando '$Name' nao encontrado no PATH."
  }
}

function Assert-Restore-Target {
  param([string]$RestoreUrl)

  if (-not $RestoreUrl) {
    throw "Configure RESTORE_DATABASE_URL ou passe -TargetDatabaseUrl."
  }

  $sourceUrls = @(
    $env:BACKUP_DATABASE_URL,
    $env:DIRECT_URL,
    $env:DATABASE_URL
  ) | Where-Object { $_ }

  foreach ($sourceUrl in $sourceUrls) {
    if ($RestoreUrl -eq $sourceUrl) {
      throw "RESTORE_DATABASE_URL aponta para o banco real. Use um banco temporario exclusivo para teste de restore."
    }
  }

  if ($RestoreUrl -notmatch "(restore|drill|teste|test|tmp|temp|ci)" -and $env:ALLOW_RESTORE_TO_NON_DRILL_DB -ne "true") {
    throw "Banco de destino nao parece ambiente de teste. Inclua restore/drill/teste/tmp no nome ou defina ALLOW_RESTORE_TO_NON_DRILL_DB=true conscientemente."
  }
}

function Get-Safe-Restore-Target {
  param([string]$RestoreUrl)

  try {
    $uri = [Uri]$RestoreUrl
    $databaseName = $uri.AbsolutePath.TrimStart("/")
    if ($databaseName) {
      return $databaseName
    }
    return $uri.Host
  } catch {
    return "restore_drill_target"
  }
}

function Resolve-Backup-File {
  param(
    [string]$LocalPath,
    [string]$S3Uri,
    [string]$OutputDir,
    [string]$Kind
  )

  if ($LocalPath) {
    if (-not (Test-Path -LiteralPath $LocalPath)) {
      throw "$Kind nao encontrado em '$LocalPath'."
    }

    return (Resolve-Path -LiteralPath $LocalPath).Path
  }

  if (-not $S3Uri) {
    return ""
  }

  Require-Command -Name "aws"
  $target = Join-Path $OutputDir (Split-Path -Leaf $S3Uri)
  $args = @("s3", "cp", $S3Uri, $target, "--only-show-errors")
  if ($env:AWS_REGION) {
    $args += @("--region", $env:AWS_REGION)
  }

  & aws @args
  if ($LASTEXITCODE -ne 0) {
    throw "Download de $Kind falhou com codigo $LASTEXITCODE."
  }

  return $target
}

Read-DotEnv -Path $EnvFile

Require-Command -Name "pg_restore"
Require-Command -Name "psql"

$restoreUrl = $TargetDatabaseUrl
if (-not $restoreUrl) {
  $restoreUrl = $env:RESTORE_DATABASE_URL
}

Assert-Restore-Target -RestoreUrl $restoreUrl

$workDir = Join-Path $env:TEMP "precast-erp-restore-drill"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

$resolvedDumpPath = Resolve-Backup-File -LocalPath $DumpPath -S3Uri $S3DumpUri -OutputDir $workDir -Kind "dump"
$resolvedChecksumPath = Resolve-Backup-File -LocalPath $ChecksumPath -S3Uri $S3ChecksumUri -OutputDir $workDir -Kind "checksum"

if (-not $resolvedDumpPath) {
  throw "Informe -DumpPath ou -S3DumpUri."
}

if (-not $SkipChecksum) {
  if (-not $resolvedChecksumPath) {
    throw "Informe -ChecksumPath ou -S3ChecksumUri, ou rode com -SkipChecksum apenas em teste controlado."
  }

  $expectedHash = ((Get-Content -LiteralPath $resolvedChecksumPath -Raw).Trim().Split(" ", 2)[0]).ToLowerInvariant()
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedDumpPath).Hash.ToLowerInvariant()

  if ($expectedHash -ne $actualHash) {
    throw "Checksum invalido. Esperado $expectedHash, obtido $actualHash."
  }

  Write-Host "Checksum validado: $actualHash"
}

Write-Host "Iniciando restore drill em banco temporario..."

& pg_restore `
  --dbname $restoreUrl `
  --clean `
  --if-exists `
  --no-owner `
  --no-privileges `
  $resolvedDumpPath

if ($LASTEXITCODE -ne 0) {
  throw "pg_restore falhou com codigo $LASTEXITCODE."
}

$tableCount = & psql $restoreUrl -v ON_ERROR_STOP=1 -Atc "select count(*) from information_schema.tables where table_schema = 'public';"
if ($LASTEXITCODE -ne 0) {
  throw "Validacao do restore falhou ao consultar tabelas."
}

$userTable = & psql $restoreUrl -v ON_ERROR_STOP=1 -Atc "select to_regclass('public.""User""') is not null;"
if ($LASTEXITCODE -ne 0 -or $userTable.Trim() -ne "t") {
  throw "Validacao do restore falhou: tabela User nao encontrada."
}

Write-Host "Restore drill concluido."
Write-Host "Tabelas public restauradas: $($tableCount.Trim())"

$safeRestoreTarget = Get-Safe-Restore-Target -RestoreUrl $restoreUrl
Write-Host "Banco de teste preservado para conferencias: $safeRestoreTarget"

$sourceBackupForEvidence = $S3DumpUri
if (-not $sourceBackupForEvidence -and $env:RESTORE_DRILL_SOURCE_BACKUP_URI) {
  $sourceBackupForEvidence = $env:RESTORE_DRILL_SOURCE_BACKUP_URI
}

if ($sourceBackupForEvidence -and $sourceBackupForEvidence -match "^s3://") {
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
    sourceBackup = $sourceBackupForEvidence
    restoreTarget = $safeRestoreTarget
    checksumVerified = (-not $SkipChecksum)
    userTableVerified = $true
    publicTableCount = [int]$tableCount.Trim()
    result = "PASS"
    notes = "Restore validado em banco temporario."
  }

  $evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $evidenceFullPath -Encoding UTF8
  Write-Host "Evidencia segura gravada em: $EvidencePath"
} else {
  Write-Host "Evidencia automatica nao gravada: informe -S3DumpUri ou RESTORE_DRILL_SOURCE_BACKUP_URI com s3://."
}
