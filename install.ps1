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
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repo = 'https://github.com/azpthiago/claude-statusline'
$raw = 'https://raw.githubusercontent.com/azpthiago/claude-statusline/main'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js 18+ e necessario e nao foi encontrado no PATH. Instale em https://nodejs.org"
}

# $PSScriptRoot fica vazio quando o script chega via irm | iex
$srcDir = $PSScriptRoot
$temp = $null

if (-not $srcDir -or -not (Test-Path (Join-Path $srcDir 'scripts\setup.js'))) {
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("claude-statusline-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path (Join-Path $temp 'scripts') -Force | Out-Null
    Write-Host "baixando de $repo ..."
    foreach ($f in @('statusline.js', 'scripts/setup.js')) {
        $dest = Join-Path $temp ($f -replace '/', '\')
        Invoke-WebRequest -Uri "$raw/$f" -OutFile $dest -UseBasicParsing
    }
    $srcDir = $temp
}

$nodeArgs = @((Join-Path $srcDir 'scripts\setup.js'))
if ($Uninstall) { $nodeArgs += '--uninstall' }
if ($DryRun) { $nodeArgs += '--dry-run' }
if (-not $Uninstall) { $nodeArgs += @('--padding', $Padding) }

try {
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) { Write-Error "a instalacao falhou (codigo $LASTEXITCODE)" }
}
finally {
    if ($temp -and (Test-Path $temp)) { Remove-Item -Recurse -Force $temp }
}
