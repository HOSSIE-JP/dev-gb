param(
    [Parameter(Position = 0)][string]$Project = 'hello-gb',
    [switch]$AllBuilds
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

try {
    $root = Get-RepoRoot
    $projectsRoot = Join-Path $root 'projects'
    if ($AllBuilds) {
        Get-ChildItem -LiteralPath $projectsRoot -Directory | ForEach-Object {
            $candidate = Join-Path $_.FullName 'build'
            if (Test-Path -LiteralPath $candidate) {
                Remove-SafeTree -Path $candidate -Root $root
                Write-Check OK "Removed $candidate"
            }
        }
    }
    else {
        $projectInfo = Get-ProjectDefinition -Root $root -Project $Project
        $buildDir = Join-Path $projectInfo.Directory 'build'
        if (Test-Path -LiteralPath $buildDir) {
            Remove-SafeTree -Path $buildDir -Root $root
            Write-Check OK "Removed $buildDir"
        }
        else {
            Write-Check INFO "Already clean: $Project"
        }
    }
    exit 0
}
catch {
    Write-Check FAIL $_.Exception.Message
    exit 1
}
