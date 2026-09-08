param(
    [switch]$SkipBuildCheck
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$failures = 0
$warnings = 0

function Report-Test {
    param([bool]$Condition, [string]$Success, [string]$Failure, [bool]$Required = $true)
    if ($Condition) {
        Write-Check OK $Success
    }
    elseif ($Required) {
        Write-Check FAIL $Failure
        $script:failures++
    }
    else {
        Write-Check WARN $Failure
        $script:warnings++
    }
}

try {
    $root = Get-RepoRoot
    Write-Host 'GB Dev environment doctor'
    Write-Host ("Repository: {0}" -f $root)

    Report-Test ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) 'Windows host detected' 'This environment targets Windows 10/11 x64.'
    Report-Test ([Environment]::Is64BitOperatingSystem) '64-bit operating system detected' 'A 64-bit operating system is required.'
    Report-Test ($PSVersionTable.PSVersion.Major -ge 5) ("PowerShell {0}" -f $PSVersionTable.PSVersion) 'PowerShell 5.1 or newer is required.'
    $git = Get-Command git -ErrorAction SilentlyContinue
    Report-Test ($null -ne $git) 'Git command is available' 'Git was not found.'
    if ($git) {
        $gitVersionOutput = @(& git --version 2>&1)
        $gitVersionExit = $LASTEXITCODE
        $gitVersion = if ($gitVersionOutput.Count -gt 0) { [string]$gitVersionOutput[0] } else { '' }
        Report-Test (($gitVersionExit -eq 0) -and ($gitVersion -match '^git version ')) $gitVersion 'Git version could not be read.'
    }
    Report-Test (Test-Path -LiteralPath (Join-Path $root '.git') -PathType Container) '.git repository exists' '.git repository is missing.'

    $lock = $null
    try {
        $lock = Read-ToolsLock -Root $root
        Write-Check OK 'config/tools.lock.json is valid JSON (schema 1)'
    }
    catch {
        Write-Check FAIL $_.Exception.Message
        $failures++
    }

    if ($lock) {
        $checks = @(
            @{ Tool='gbdk'; Path='bin\lcc.exe'; Label='GBDK lcc'; Required=$true },
            @{ Tool='gbdk'; Path='bin\png2asset.exe'; Label='GBDK png2asset'; Required=$true },
            @{ Tool='gbdk'; Path='bin\romusage.exe'; Label='GBDK romusage'; Required=$true },
            @{ Tool='rgbds'; Path='rgbasm.exe'; Label='RGBDS rgbasm'; Required=$false },
            @{ Tool='rgbds'; Path='rgblink.exe'; Label='RGBDS rgblink'; Required=$false },
            @{ Tool='rgbds'; Path='rgbfix.exe'; Label='RGBDS rgbfix'; Required=$false },
            @{ Tool='rgbds'; Path='rgbgfx.exe'; Label='RGBDS rgbgfx'; Required=$false },
            @{ Tool='bgb'; Path='bgb64.exe'; Label='BGB'; Required=$false },
            @{ Tool='emulicious'; Path='Emulicious.exe'; Label='Emulicious'; Required=$false },
            @{ Tool='vscode'; Path='Code.exe'; Label='VS Code'; Required=$false }
        )
        foreach ($item in $checks) {
            $property = $lock.tools.PSObject.Properties[$item.Tool]
            if (-not $property) {
                Report-Test $false '' ("Lock entry is missing: {0}" -f $item.Tool) $item.Required
                continue
            }
            $tool = $property.Value
            $installRoot = Get-ToolInstallPath -Root $root -Tool $tool
            $path = Join-Path $installRoot $item.Path
            Report-Test (Test-Path -LiteralPath $path -PathType Leaf) ("{0} {1}: {2}" -f $item.Label, $tool.version, $path) ("{0} is missing: {1}" -f $item.Label, $path) $item.Required
        }

        foreach ($property in $lock.tools.PSObject.Properties) {
            $tool = $property.Value
            $validHash = ([string]$tool.sha256) -match '^[0-9a-f]{64}$'
            Report-Test $validHash ("Locked SHA-256 present: {0}" -f $property.Name) ("Missing/invalid SHA-256: {0}" -f $property.Name)
            Report-Test (([string]$tool.url) -match '^https://') ("Locked HTTPS URL recorded: {0}" -f $property.Name) ("Tool URL is not HTTPS: {0}" -f $property.Name)
        }

        $emuliciousProperty = $lock.tools.PSObject.Properties['emulicious']
        if ($emuliciousProperty -and $emuliciousProperty.Value.bundledJava) {
            $emuliciousRoot = Get-ToolInstallPath -Root $root -Tool $emuliciousProperty.Value
            $java = Get-ChildItem -LiteralPath $emuliciousRoot -Filter java.exe -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            Report-Test ($null -ne $java) ("Bundled Java runtime: {0}" -f $java.FullName) 'Emulicious is locked with bundled Java, but java.exe is missing.' $false
        }
    }

    $portableData = Join-Path $root '.tools\vscode\data'
    $portableTmp = Join-Path $portableData 'tmp'
    Report-Test ((Test-Path -LiteralPath $portableData -PathType Container) -and (Test-Path -LiteralPath $portableTmp -PathType Container)) 'VS Code portable data directories exist' 'VS Code portable data directories are missing.' $false
    $codeCli = Join-Path $root '.tools\vscode\bin\code.cmd'
    if ($lock -and (Test-Path -LiteralPath $codeCli) -and ($lock.PSObject.Properties.Name -contains 'vscodeExtensions')) {
        $global:LASTEXITCODE = 0
        $installedExtensions = @(& $codeCli --list-extensions --show-versions 2>$null)
        if ($LASTEXITCODE -ne 0) {
            Write-Check WARN 'Portable VS Code extension inventory could not be read.'
            $warnings++
        }
        else {
            foreach ($extension in $lock.vscodeExtensions) {
                $expectedExtension = "$($extension.id)@$($extension.version)"
                Report-Test ($installedExtensions -contains $expectedExtension) ("VS Code extension: {0}" -f $expectedExtension) ("VS Code extension is missing or version-mismatched: {0}" -f $expectedExtension) $false
            }
        }
    }
    $tempDir = Join-Path $root '.cache\tmp'
    Report-Test (Test-Path -LiteralPath $tempDir -PathType Container) 'Repository-local TEMP/TMP directory exists' 'Repository-local TEMP/TMP directory is missing.' $false

    if ($git) {
        & git -C $root -c ("safe.directory={0}" -f ($root -replace '\\', '/')) check-ignore -q -- '.tools/probe.txt'
        Report-Test ($LASTEXITCODE -eq 0) '.tools is ignored by Git' '.tools is not ignored by Git.'
    }

    $allScripts = @(Get-ChildItem -LiteralPath $root -Filter '*.cmd' -File) + @(Get-ChildItem -LiteralPath (Join-Path $root 'scripts') -Include '*.ps1','*.cmd' -File)
    $hardCoded = $false
    foreach ($scriptFile in $allScripts) {
        $text = Get-Content -LiteralPath $scriptFile.FullName -Raw
        if ($text -match '(?i)C:\\Users\\gameo\\Documents\\homebrew\\gb-dev') { $hardCoded = $true; break }
    }
    Report-Test (-not $hardCoded) 'Scripts derive paths from their own location' 'A script contains the workstation-specific absolute repository path.'
    $quotedProbe = ConvertTo-WindowsCommandLine -ArgumentList @('-ini', 'C:\path with spaces\bgb.ini', 'C:\path with spaces\game.gb')
    Report-Test ($quotedProbe -eq '-ini "C:\path with spaces\bgb.ini" "C:\path with spaces\game.gb"') 'Windows native launch arguments preserve paths with spaces' 'Windows native launch argument quoting self-test failed.'

    $persistentPaths = @(
        [Environment]::GetEnvironmentVariable('Path', 'User'),
        [Environment]::GetEnvironmentVariable('Path', 'Machine')
    ) -join ';'
    Report-Test ($persistentPaths.IndexOf((Join-Path $root '.tools'), [StringComparison]::OrdinalIgnoreCase) -lt 0) 'No repository tool path found in persistent PATH' 'Repository-local tools appear in a persistent PATH.'

    if (-not $SkipBuildCheck -and $lock -and (Test-Path -LiteralPath (Join-Path $root '.tools\gbdk\bin\lcc.exe'))) {
        & (Join-Path $PSScriptRoot 'build.ps1') 'hello-gb' -Configuration Release -Quiet
        Report-Test ($LASTEXITCODE -eq 0) 'hello-gb builds successfully' 'hello-gb build check failed.'
    }
    elseif ($SkipBuildCheck) {
        Write-Check INFO 'hello-gb build check skipped by caller'
    }

    foreach ($editorPath in @('.tools\node\node.exe','.tools\electron\electron.exe','.tools\misaki\misaki_gothic.bdf','editor\node_modules\boytacean\boytacean_bg.wasm','editor\build\main.cjs','editor\build\renderer.js','editor\package-lock.json')) {
        Report-Test (Test-Path -LiteralPath (Join-Path $root $editorPath) -PathType Leaf) ("Editor component: {0}" -f $editorPath) ("Editor component is missing: {0}; run bootstrap.cmd" -f $editorPath)
    }
    if ($failures -gt 0) {
        Write-Check FAIL ("Doctor found {0} required failure(s) and {1} warning(s)." -f $failures, $warnings)
        exit 1
    }
    Write-Check OK ("Doctor completed with {0} warning(s)." -f $warnings)
    exit 0
}
catch {
    Write-Check FAIL $_.Exception.Message
    exit 1
}
