param(
  [string]$ProjectPath = "",
  [string]$EnvFile = ".env",
  [string]$TaskPrefix = "PRECAST ERP",
  [string]$FullBackupAt = "02:00",
  [int]$IncrementalIntervalMinutes = 60,
  [string]$ConfigCheckAt = "07:00",
  [string]$BackupEvidenceCheckAt = "07:30",
  [string]$S3PostureCheckAt = "07:45",
  [string]$RestoreEvidenceCheckAt = "08:00",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

function Resolve-ProjectPath {
  param([string]$PathValue)

  if (-not $PathValue) {
    $PathValue = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
  }

  $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction Stop
  $packageJson = Join-Path $resolved.Path "package.json"

  if (-not (Test-Path -LiteralPath $packageJson)) {
    throw "ProjectPath precisa apontar para a pasta do ERP com package.json."
  }

  return $resolved.Path
}

function New-TaskActionFromNpm {
  param(
    [string]$ProjectRoot,
    [string]$ScriptName,
    [string]$ExtraArgs = ""
  )

  $npmCommand = "npm.cmd run $ScriptName"
  if ($ExtraArgs) {
    $npmCommand = "$npmCommand -- $ExtraArgs"
  }

  $command = @(
    "Set-Location -LiteralPath '$($ProjectRoot.Replace("'", "''"))'",
    "`$env:NODE_ENV='production'",
    $npmCommand
  ) -join "; "

  return New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"& { $command }`""
}

function Register-Or-PreviewTask {
  param(
    [string]$Name,
    [string]$Description,
    [object]$Action,
    [object]$Trigger
  )

  Write-Host ""
  Write-Host "Tarefa: $Name"
  Write-Host "Descricao: $Description"

  if (-not $Apply) {
    Write-Host "Modo dry-run: use -Apply para registrar esta tarefa no Windows."
    return
  }

  Register-ScheduledTask `
    -TaskName $Name `
    -Action $Action `
    -Trigger $Trigger `
    -Description $Description `
    -Force | Out-Null

  Write-Host "Registrada."
}

function Parse-TimeToday {
  param([string]$Value)

  $parts = $Value.Split(":", 2)
  if ($parts.Count -ne 2) {
    throw "Horario invalido: $Value. Use HH:mm."
  }

  return (Get-Date).Date.AddHours([int]$parts[0]).AddMinutes([int]$parts[1])
}

$projectRoot = Resolve-ProjectPath -PathValue $ProjectPath
$envFileArg = "-EnvFile `"$EnvFile`""

if ($IncrementalIntervalMinutes -lt 15) {
  throw "IncrementalIntervalMinutes minimo: 15."
}

Write-Host "Configuracao de tarefas de backup do PRECAST ERP"
Write-Host "Projeto: $projectRoot"
Write-Host "EnvFile: $EnvFile"
Write-Host "Prefixo: $TaskPrefix"
Write-Host "Aplicar: $Apply"

if (-not $Apply) {
  Write-Host ""
  Write-Host "Plano dry-run:"
  Write-Host "- $TaskPrefix - Backup completo diario: diariamente as $FullBackupAt"
  Write-Host "- $TaskPrefix - Backup incremental: a cada $IncrementalIntervalMinutes minuto(s)"
  Write-Host "- $TaskPrefix - Verificacao configuracao backup: diariamente as $ConfigCheckAt"
  Write-Host "- $TaskPrefix - Verificacao evidencia backup: diariamente as $BackupEvidenceCheckAt"
  Write-Host "- $TaskPrefix - Verificacao postura S3: diariamente as $S3PostureCheckAt"
  Write-Host "- $TaskPrefix - Verificacao restore drill: toda segunda as $RestoreEvidenceCheckAt"
  Write-Host ""
  Write-Host "Nenhuma tarefa foi registrada porque -Apply nao foi informado."
  exit 0
}

$fullBackupTrigger = New-ScheduledTaskTrigger -Daily -At (Parse-TimeToday -Value $FullBackupAt)
$fullBackupAction = New-TaskActionFromNpm `
  -ProjectRoot $projectRoot `
  -ScriptName "backup:full" `
  -ExtraArgs $envFileArg

Register-Or-PreviewTask `
  -Name "$TaskPrefix - Backup completo diario" `
  -Description "Executa pg_dump e envia backup completo do ERP para storage externo." `
  -Action $fullBackupAction `
  -Trigger $fullBackupTrigger

$incrementalTrigger = New-ScheduledTaskTrigger `
  -Once `
  -At ((Get-Date).Date.AddMinutes(10)) `
  -RepetitionInterval (New-TimeSpan -Minutes $IncrementalIntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$incrementalAction = New-TaskActionFromNpm `
  -ProjectRoot $projectRoot `
  -ScriptName "backup:incremental" `
  -ExtraArgs $envFileArg

Register-Or-PreviewTask `
  -Name "$TaskPrefix - Backup incremental" `
  -Description "Exporta alteracoes logicas recentes do ERP para storage externo." `
  -Action $incrementalAction `
  -Trigger $incrementalTrigger

$configCheckTrigger = New-ScheduledTaskTrigger -Daily -At (Parse-TimeToday -Value $ConfigCheckAt)
$configCheckAction = New-TaskActionFromNpm `
  -ProjectRoot $projectRoot `
  -ScriptName "backup:check-config" `
  -ExtraArgs "--env-file `"$EnvFile`""

Register-Or-PreviewTask `
  -Name "$TaskPrefix - Verificacao configuracao backup" `
  -Description "Valida variaveis, isolamento do restore e ferramentas de backup." `
  -Action $configCheckAction `
  -Trigger $configCheckTrigger

$backupEvidenceTrigger = New-ScheduledTaskTrigger -Daily -At (Parse-TimeToday -Value $BackupEvidenceCheckAt)
$backupEvidenceAction = New-TaskActionFromNpm `
  -ProjectRoot $projectRoot `
  -ScriptName "backup:check-evidence"

Register-Or-PreviewTask `
  -Name "$TaskPrefix - Verificacao evidencia backup" `
  -Description "Confere se ha evidencia recente de backup completo enviado ao storage externo." `
  -Action $backupEvidenceAction `
  -Trigger $backupEvidenceTrigger

$s3PostureTrigger = New-ScheduledTaskTrigger -Daily -At (Parse-TimeToday -Value $S3PostureCheckAt)
$s3PostureAction = New-TaskActionFromNpm `
  -ProjectRoot $projectRoot `
  -ScriptName "backup:check-s3" `
  -ExtraArgs "--env-file `"$EnvFile`" --write-evidence `"docs/security/backups/s3-posture-latest.json`""

Register-Or-PreviewTask `
  -Name "$TaskPrefix - Verificacao postura S3" `
  -Description "Valida bloqueio publico, criptografia, versionamento e TLS do bucket externo." `
  -Action $s3PostureAction `
  -Trigger $s3PostureTrigger

$restoreEvidenceTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At (Parse-TimeToday -Value $RestoreEvidenceCheckAt)
$restoreEvidenceAction = New-TaskActionFromNpm `
  -ProjectRoot $projectRoot `
  -ScriptName "backup:check-restore-drill"

Register-Or-PreviewTask `
  -Name "$TaskPrefix - Verificacao restore drill" `
  -Description "Confere se ha evidencia recente de restore drill testado." `
  -Action $restoreEvidenceAction `
  -Trigger $restoreEvidenceTrigger

Write-Host ""
Write-Host "Concluido."
if (-not $Apply) {
  Write-Host "Nenhuma tarefa foi registrada porque -Apply nao foi informado."
}
