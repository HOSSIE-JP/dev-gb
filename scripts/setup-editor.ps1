param([switch]$Offline,[switch]$Force)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$root = Get-RepoRoot
$nodeRoot = Join-Path $root '.tools\node'
$node = Join-Path $nodeRoot 'node.exe'
$npm = Join-Path $nodeRoot 'npm.cmd'
if (-not (Test-Path -LiteralPath $node)) { throw 'The locked portable Node.js runtime is missing.' }
$lockfile = Join-Path $root 'editor\package-lock.json'
$stamp = Join-Path $root '.cache\editor-deps.sha256'
$digest = Get-Sha256 -Path $lockfile
$current = (Test-Path -LiteralPath $stamp) -and ((Get-Content -LiteralPath $stamp -Raw).Trim() -eq $digest) -and (Test-Path -LiteralPath (Join-Path $root 'editor\node_modules\boytacean\boytacean_bg.wasm'))
$oldPath = $env:PATH
try {
    $env:PATH = $nodeRoot + ';' + $env:PATH
    if (-not $current -or $Force) {
        $arguments = @('ci','--prefix',(Join-Path $root 'editor'),'--cache',(Join-Path $root '.cache\npm'),'--ignore-scripts','--no-audit','--no-fund')
        if ($Offline) { $arguments += '--offline' }
        & $npm @arguments
        if ($LASTEXITCODE -ne 0) { throw 'Editor dependencies could not be restored from package-lock.json.' }
        [IO.File]::WriteAllText($stamp,$digest)
    }
    Invoke-CheckedCommand -FilePath $node -ArgumentList @((Join-Path $root 'editor\build.mjs')) -WorkingDirectory $root
    Write-Check OK 'Caravan Editor dependencies and application are ready'
} finally { $env:PATH = $oldPath }
