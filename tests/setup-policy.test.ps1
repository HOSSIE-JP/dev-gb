$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'scripts/setup-policy.ps1')
function Assert-Equal($Actual, $Expected) {
    if (($Actual -join ',') -ne ($Expected -join ',')) { throw "Expected $Expected; received $Actual" }
}
Assert-Equal @(Get-SetupSelection) @('node','electron','misaki','gbdk')
Assert-Equal @(Get-SetupSelection ' BGB, rgbds,bgb ') @('node','electron','misaki','gbdk','bgb','rgbds')
Assert-Equal @(Get-SetupSelection 'emulicious,vscode') @('node','electron','misaki','gbdk','emulicious','vscode')
foreach ($invalid in @('../gbdk','all','bgb;whoami','https://example.org/tool.zip')) {
    $rejected = $false
    try { $null = Get-SetupSelection $invalid } catch { $rejected = $true }
    if (-not $rejected) { throw "Invalid selection accepted: $invalid" }
}
foreach ($file in Get-ChildItem (Join-Path $root 'scripts') -Filter '*.ps1') {
    $tokens = $null; $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
}
$lock = Get-Content (Join-Path $root 'config/tools.lock.json') -Raw | ConvertFrom-Json
foreach ($name in @(Get-SetupSelection 'bgb,emulicious,rgbds,vscode')) {
    if (-not $lock.tools.PSObject.Properties[$name]) { throw "Missing tool lock: $name" }
    if ($lock.tools.$name.installDir -notlike '.tools/*') { throw "Non-portable destination: $name" }
}
$hostBinary = @('powershell.exe', 'pwsh.exe', 'pwsh') | ForEach-Object { Join-Path $PSHOME $_ } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$before = (Get-FileHash (Join-Path $root 'config/tools.lock.json') -Algorithm SHA256).Hash
$plan = (& $hostBinary -NoProfile -File (Join-Path $root 'scripts/bootstrap.ps1') -List | Out-String)
if ($LASTEXITCODE -ne 0 -or $plan -match 'Emulicious|BGB|RGBDS|VS Code') { throw 'Core-only plan contains an optional tool or failed.' }
$selected = (& $hostBinary -NoProfile -File (Join-Path $root 'scripts/setup.ps1') -OptionalTools bgb -List | Out-String)
if ($LASTEXITCODE -ne 0 -or $selected -notmatch 'BGB' -or $selected -match 'Emulicious') { throw 'Explicit BGB setup plan is incorrect.' }
$after = (Get-FileHash (Join-Path $root 'config/tools.lock.json') -Algorithm SHA256).Hash
Assert-Equal $after $before
Write-Host 'Setup policy, plan execution and PowerShell syntax checks passed.'
