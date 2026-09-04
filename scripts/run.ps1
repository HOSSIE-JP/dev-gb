param(
    [Parameter(Position = 0)][string]$Project = 'hello-gb',
    [ValidateSet('BGB', 'Emulicious')][string]$Emulator = 'BGB',
    [ValidateSet('Debug', 'Release')][string]$Configuration = 'Release',
    [switch]$Wait,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

try {
    $root = Get-RepoRoot
    $lock = Read-ToolsLock -Root $root
    $projectInfo = Get-ProjectDefinition -Root $root -Project $Project
    $romPath = Join-Path (Join-Path (Join-Path $projectInfo.Directory 'build') $Configuration) ([string]$projectInfo.Definition.output)
    if (-not (Test-Path -LiteralPath $romPath -PathType Leaf)) {
        Write-Check INFO 'ROM is missing; building it first.'
        & (Join-Path $PSScriptRoot 'build.ps1') $Project -Configuration $Configuration
        if ($LASTEXITCODE -ne 0) { throw 'Build failed; emulator was not started.' }
    }

    if ($Emulator -eq 'BGB') {
        $tool = $lock.tools.bgb
        $installRoot = Get-ToolInstallPath -Root $root -Tool $tool
        $executable = Join-Path $installRoot 'bgb64.exe'
        $runtimeDir = Join-Path $root '.cache\emulator\bgb'
        Ensure-Directory -Path $runtimeDir
        $iniPath = Join-Path $runtimeDir 'bgb.ini'
        $arguments = @('-ini', $iniPath, $romPath)
    }
    else {
        $tool = $lock.tools.emulicious
        $installRoot = Get-ToolInstallPath -Root $root -Tool $tool
        $executable = Join-Path $installRoot 'Emulicious.exe'
        $runtimeDir = Join-Path $root '.cache\emulator\emulicious'
        Ensure-Directory -Path $runtimeDir
        $arguments = @($romPath)
    }
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw "$Emulator is not bootstrapped. Missing: $executable`nRun bootstrap.cmd first."
    }

    Write-Host ("Executable: {0}" -f $executable)
    Write-Host ("ROM:        {0}" -f $romPath)
    $commandLine = ConvertTo-WindowsCommandLine -ArgumentList $arguments
    Write-Host ("Arguments:  {0}" -f $commandLine)
    if ($DryRun) {
        Write-Check OK "$Emulator launch command validated (dry run)"
        exit 0
    }
    $processArgs = @{
        FilePath = $executable
        ArgumentList = $commandLine
        WorkingDirectory = $runtimeDir
        PassThru = $true
    }
    $process = Start-Process @processArgs
    if ($Wait) { $process.WaitForExit(); exit $process.ExitCode }
    Write-Check OK "$Emulator started (PID $($process.Id))"
    exit 0
}
catch {
    Write-Check FAIL $_.Exception.Message
    exit 1
}
