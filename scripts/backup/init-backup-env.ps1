param(
  [string]$ProjectPath = "",
  [string]$EnvFile = "C:\seguro\precast-backup.env",
  [string]$TemplatePath = "docs/security/backups/precast-backup.env.template",
  [switch]$Apply,
  [switch]$Force
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

function Resolve-TargetPath {
  param(
    [string]$ProjectRoot,
    [string]$PathValue
  )

  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return [System.IO.Path]::GetFullPath($PathValue)
  }

  return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $PathValue))
}

function Assert-OutsideProject {
  param(
    [string]$ProjectRoot,
    [string]$TargetPath
  )

  $projectFull = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  $targetFull = [System.IO.Path]::GetFullPath($TargetPath)

  if ($targetFull.StartsWith($projectFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "EnvFile precisa ficar fora do repositorio. Use um caminho como C:\seguro\precast-backup.env."
  }
}

$projectRoot = Resolve-ProjectPath -PathValue $ProjectPath
$templateFull = Resolve-TargetPath -ProjectRoot $projectRoot -PathValue $TemplatePath
$targetFull = Resolve-TargetPath -ProjectRoot $projectRoot -PathValue $EnvFile

if (-not (Test-Path -LiteralPath $templateFull)) {
  throw "Template nao encontrado: $templateFull"
}

Assert-OutsideProject -ProjectRoot $projectRoot -TargetPath $targetFull

Write-Host "Inicializacao do arquivo externo de backup do PRECAST ERP"
Write-Host "Projeto: $projectRoot"
Write-Host "Template: $templateFull"
Write-Host "Destino externo: $targetFull"
Write-Host "Aplicar: $Apply"

if (-not $Apply) {
  Write-Host ""
  Write-Host "Modo dry-run: nenhum arquivo foi criado."
  Write-Host "Para criar o arquivo externo, rode novamente com -Apply."
  Write-Host "Depois edite o arquivo gerado e preencha os valores reais no servidor/agendador."
  exit 0
}

$targetDirectory = Split-Path -Parent $targetFull
if (-not (Test-Path -LiteralPath $targetDirectory)) {
  New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
}

if ((Test-Path -LiteralPath $targetFull) -and -not $Force) {
  throw "Arquivo ja existe. Use -Force somente se quiser substituir conscientemente: $targetFull"
}

Copy-Item -LiteralPath $templateFull -Destination $targetFull -Force:$Force

Write-Host "Arquivo externo criado."
Write-Host "Edite o arquivo fora do repositorio e preencha as credenciais reais."
Write-Host "Para validar depois:"
Write-Host "npm run backup:check-config -- --env-file `"$targetFull`""
