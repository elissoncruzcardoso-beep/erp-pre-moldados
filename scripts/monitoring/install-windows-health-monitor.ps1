param(
  [string]$ProjectPath = "",
  [string]$HealthcheckUrl = "",
  [string]$TaskPrefix = "PRECAST ERP",
  [int]$IntervalMinutes = 5,
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

function Assert-HealthcheckUrl {
  param([string]$Url)

  if (-not $Url) {
    throw "Informe -HealthcheckUrl com a URL publica do ERP ou defina HEALTHCHECK_URL."
  }

  if ($Url -notmatch "^https?://") {
    throw "HealthcheckUrl precisa comecar com http:// ou https://."
  }

  if ($Url -match "(token|key|secret|password|senha)=") {
    throw "HealthcheckUrl nao deve conter token, chave, senha ou segredo na query string."
  }
}

function New-HealthMonitorAction {
  param(
    [string]$ProjectRoot,
    [string]$Url
  )

  $safeProject = $ProjectRoot.Replace("'", "''")
  $safeUrl = $Url.Replace("'", "''")

  $command = @(
    "Set-Location -LiteralPath '$safeProject'",
    "`$env:HEALTHCHECK_URL='$safeUrl'",
    "npm.cmd run monitoring:check-health"
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

if ($IntervalMinutes -lt 1) {
  throw "IntervalMinutes minimo: 1."
}

if (-not $HealthcheckUrl -and $env:HEALTHCHECK_URL) {
  $HealthcheckUrl = $env:HEALTHCHECK_URL
}

Assert-HealthcheckUrl -Url $HealthcheckUrl

$projectRoot = Resolve-ProjectPath -PathValue $ProjectPath
$taskName = "$TaskPrefix - Monitor healthcheck"

Write-Host "Configuracao de monitoramento do PRECAST ERP"
Write-Host "Projeto: $projectRoot"
Write-Host "URL: $HealthcheckUrl"
Write-Host "Intervalo: $IntervalMinutes minuto(s)"
Write-Host "Aplicar: $Apply"

if (-not $Apply) {
  Write-Host ""
  Write-Host "Tarefa: $taskName"
  Write-Host "Descricao: Executa checagem periodica do endpoint /api/health do ERP."
  Write-Host "Modo dry-run: use -Apply para registrar esta tarefa no Windows."
  Write-Host ""
  Write-Host "Nenhuma tarefa foi registrada porque -Apply nao foi informado."
  exit 0
}

$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At ((Get-Date).Date.AddMinutes(5)) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$action = New-HealthMonitorAction -ProjectRoot $projectRoot -Url $HealthcheckUrl

Register-Or-PreviewTask `
  -Name $taskName `
  -Description "Executa checagem periodica do endpoint /api/health do ERP." `
  -Action $action `
  -Trigger $trigger
