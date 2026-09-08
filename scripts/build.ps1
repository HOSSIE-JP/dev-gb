param(
    [Parameter(Position = 0)][string]$Project = 'hello-gb',
    [ValidateSet('Debug', 'Release')][string]$Configuration = 'Release',
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

try {
    $root = Get-RepoRoot
    $lock = Read-ToolsLock -Root $root
    $projectInfo = Get-ProjectDefinition -Root $root -Project $Project
    $definition = $projectInfo.Definition
    if (($definition.PSObject.Properties.Name -contains 'editor') -and $definition.editor.type -eq 'caravan') {
        $node = Join-Path $root '.tools\node\node.exe'
        if (-not (Test-Path -LiteralPath $node)) { throw 'Run bootstrap.cmd to install the editor toolchain.' }
        Invoke-CheckedCommand -FilePath $node -ArgumentList @((Join-Path $root 'editor\build.mjs')) -WorkingDirectory $root
        Invoke-CheckedCommand -FilePath $node -ArgumentList @((Join-Path $root 'editor\build\compiler.cjs'), $root, $Project, $Configuration) -WorkingDirectory $root
        exit 0
    }
    $gbdk = $lock.tools.gbdk
    if (-not $gbdk) { throw 'GBDK is not present in tools.lock.json.' }
    $gbdkRoot = Get-ToolInstallPath -Root $root -Tool $gbdk
    $lcc = Join-Path $gbdkRoot 'bin\lcc.exe'
    if (-not (Test-Path -LiteralPath $lcc -PathType Leaf)) {
        throw "GBDK is not bootstrapped. Missing: $lcc`nRun bootstrap.cmd first."
    }

    $buildDir = Join-Path (Join-Path $projectInfo.Directory 'build') $Configuration
    Ensure-Directory -Path $buildDir
    $romPath = Join-Path $buildDir ([string]$definition.output)
    $arguments = New-Object System.Collections.Generic.List[string]
    $includePath = Join-Path $projectInfo.Directory 'include'
    $relativeInclude = Get-RelativePathCompat -BaseDirectory $buildDir -Path $includePath
    if ($relativeInclude -match '\s') { throw "GBDK lcc cannot reliably consume an include path containing whitespace: $relativeInclude" }
    $arguments.Add('-I' + $relativeInclude)
    if ($Configuration -eq 'Debug') { $arguments.Add('-debug') }
    if ($definition.PSObject.Properties.Name -contains 'lccFlags') {
        foreach ($flag in $definition.lccFlags) {
            $flagText = [string]$flag
            if (($flagText -notmatch '^-[^\r\n]+$')) { throw "Unsafe lcc flag in project.json: $flagText" }
            $arguments.Add($flagText)
        }
    }
    $arguments.Add('-o')
    $outputName = [string]$definition.output
    if ($outputName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:gb|gbc)$') { throw "Unsafe or unsupported ROM output name: $outputName" }
    $arguments.Add($outputName)
    foreach ($source in $definition.sources) {
        $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $projectInfo.Directory ([string]$source)))
        if (-not (Test-PathInsideRoot -Path $sourcePath -Root $projectInfo.Directory)) {
            throw "Source is outside its project directory: $source"
        }
        Assert-NoReparsePointsBelowRoot -Path $sourcePath -Root $root
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Source file not found: $sourcePath"
        }
        $relativeSource = Get-RelativePathCompat -BaseDirectory $buildDir -Path $sourcePath
        if ($relativeSource -match '\s') { throw "GBDK lcc cannot reliably consume a source path containing whitespace: $relativeSource" }
        $arguments.Add($relativeSource)
    }

    if (-not $Quiet) {
        Write-Check INFO "Building $Project ($Configuration)"
    }
    Invoke-CheckedCommand -FilePath $lcc -ArgumentList $arguments.ToArray() -WorkingDirectory $buildDir

    if (-not (Test-Path -LiteralPath $romPath -PathType Leaf)) { throw "Compiler did not create ROM: $romPath" }
    $rom = Get-Item -LiteralPath $romPath
    if ($rom.Length -le 0) { throw "Compiler created an empty ROM: $romPath" }

    $romusage = Join-Path $gbdkRoot 'bin\romusage.exe'
    if ((Test-Path -LiteralPath $romusage -PathType Leaf) -and (-not $Quiet)) {
        & $romusage $romPath
        if ($LASTEXITCODE -ne 0) { Write-Check WARN 'romusage could not inspect the ROM.' }
    }

    if (-not $Quiet) {
        Write-Host ("Project:           {0}" -f $Project)
        Write-Host ("Configuration:     {0}" -f $Configuration)
        Write-Host ("Toolchain version: {0}" -f $gbdk.version)
        Write-Host ("Output ROM path:   {0}" -f $rom.FullName)
        Write-Host ("ROM size:          {0} bytes" -f $rom.Length)
        Write-Check OK 'Build succeeded'
    }
    exit 0
}
catch {
    Write-Check FAIL $_.Exception.Message
    exit 1
}
