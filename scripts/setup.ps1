param(
    [string]$OptionalTools = '',
    [switch]$List,
    [switch]$Offline,
    [switch]$Force,
    [switch]$SkipExtensions
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'setup-policy.ps1')
try {
    if (-not $List -and -not $PSBoundParameters.ContainsKey('OptionalTools')) {
        Write-Host 'Caravan Editor portable setup'
        Write-Host 'Required: GBDK, Node.js, Electron, Misaki font'
        Write-Host 'Optional: bgb, emulicious, rgbds, vscode'
        Write-Host 'Files stay under .tools, .downloads, .cache and editor/node_modules.'
        foreach ($name in @('bgb', 'emulicious', 'rgbds', 'vscode')) {
            Write-Host (Get-SetupDescription $name)
        }
        Write-Host 'Read docs/third-party-tools.md for the applicable licenses.'
        $OptionalTools = Read-Host 'Optional tools (comma-separated; Enter = required only)'
    }
    $null = Get-SetupSelection -OptionalTools $OptionalTools
    & (Join-Path $PSScriptRoot 'bootstrap.ps1') -OptionalTools $OptionalTools -List:$List -Offline:$Offline -Force:$Force -SkipExtensions:$SkipExtensions
    exit $LASTEXITCODE
} catch { Write-Error $_.Exception.Message; exit 1 }
