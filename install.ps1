<#
.SYNOPSIS
    Instalador da statusline do Claude Code para Windows.

.EXAMPLE
    irm https://raw.githubusercontent.com/azpthiago/claude-statusline/main/install.ps1 | iex

.EXAMPLE
    .\install.ps1 -Padding 1

.EXAMPLE
    .\install.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [int]$Padding = 0,
    [switch]$Uninstall,
    [switch]$DryRun,
    [switch]$NoColor
)

$ErrorActionPreference = 'Stop'

$repo = 'https://github.com/azpthiago/claude-statusline'
$raw = 'https://raw.githubusercontent.com/azpthiago/claude-statusline/main'

# cores no mesmo tom do instalador em Node
$useColor = -not $NoColor -and -not $env:NO_COLOR
$esc = [char]27
$coral = if ($useColor) { "$esc[38;5;209m" } else { '' }
$gray = if ($useColor) { "$esc[38;5;245m" } else { '' }
$red = if ($useColor) { "$esc[38;5;203m" } else { '' }
$faint = if ($useColor) { "$esc[2m" } else { '' }
$off = if ($useColor) { "$esc[0m" } else { '' }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ''
    Write-Host "  $red✗$off Node.js 18+ e necessario e nao foi encontrado no PATH."
    Write-Host "    ${gray}Instale em https://nodejs.org e rode novamente.$off"
    Write-Host ''
    exit 1
}

# $PSScriptRoot fica vazio quando o script chega via irm | iex
$srcDir = $PSScriptRoot
$temp = $null

if (-not $srcDir -or -not (Test-Path (Join-Path $srcDir 'scripts\setup.js'))) {
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("claude-statusline-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path (Join-Path $temp 'scripts') -Force | Out-Null
    Write-Host ''
    Write-Host "  $coral✻$off ${faint}baixando de $repo$off"
    foreach ($f in @('statusline.js', 'scripts/setup.js')) {
        $dest = Join-Path $temp ($f -replace '/', '\')
        Invoke-WebRequest -Uri "$raw/$f" -OutFile $dest -UseBasicParsing
    }
    $srcDir = $temp
}

$nodeArgs = @((Join-Path $srcDir 'scripts\setup.js'))
if ($Uninstall) { $nodeArgs += '--uninstall' }
if ($DryRun) { $nodeArgs += '--dry-run' }
if ($NoColor) { $nodeArgs += '--no-color' }
if (-not $Uninstall) { $nodeArgs += @('--padding', $Padding) }

try {
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) { Write-Error "a instalacao falhou (codigo $LASTEXITCODE)" }
}
finally {
    if ($temp -and (Test-Path $temp)) { Remove-Item -Recurse -Force $temp }
}
