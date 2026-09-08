param([Parameter(Position=0)][string]$Project = 'star-caravan')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
try {
    $root = Get-RepoRoot
    $info = Get-ProjectDefinition -Root $root -Project $Project
    if ($info.Definition.editor.type -ne 'caravan') { throw 'This project is not a Caravan Editor project.' }
    $node = Join-Path $root '.tools\node\node.exe'
    $electron = Join-Path $root '.tools\electron\electron.exe'
    if (-not (Test-Path -LiteralPath $electron)) { throw 'Run bootstrap.cmd first.' }
    Invoke-CheckedCommand -FilePath $node -ArgumentList @((Join-Path $root 'editor\build.mjs')) -WorkingDirectory $root
    $launchArgs = ConvertTo-WindowsCommandLine -ArgumentList @((Join-Path $root 'editor'), $Project)
    Start-Process -FilePath $electron -ArgumentList $launchArgs -WorkingDirectory $root | Out-Null
    exit 0
} catch { Write-Check FAIL $_.Exception.Message; exit 1 }
