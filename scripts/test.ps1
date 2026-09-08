param(
    [Parameter(Position = 0)][string]$Project = 'all'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

try {
    $root = Get-RepoRoot
    & (Join-Path $PSScriptRoot 'doctor.ps1') -SkipBuildCheck
    if ($LASTEXITCODE -ne 0) { throw 'doctor failed.' }

    if ($Project -eq 'all') {
        $projects = @(Get-ChildItem -LiteralPath (Join-Path $root 'projects') -Directory | Where-Object {
            Test-Path -LiteralPath (Join-Path $_.FullName 'project.json')
        } | ForEach-Object Name)
    }
    else {
        $projects = @($Project)
    }
    if ($projects.Count -eq 0) { throw 'No projects were found.' }

    foreach ($projectName in $projects) {
        & (Join-Path $PSScriptRoot 'clean.ps1') $projectName
        if ($LASTEXITCODE -ne 0) { throw "Clean failed: $projectName" }
        & (Join-Path $PSScriptRoot 'build.ps1') $projectName -Configuration Debug
        if ($LASTEXITCODE -ne 0) { throw "Debug build failed: $projectName" }
        $projectInfo = Get-ProjectDefinition -Root $root -Project $projectName
        $romPath = Join-Path (Join-Path $projectInfo.Directory 'build\Debug') ([string]$projectInfo.Definition.output)
        & (Join-Path $root 'tests\smoke-test.ps1') -RomPath $romPath -ProjectJson $projectInfo.DefinitionPath
        if ($LASTEXITCODE -ne 0) { throw "ROM smoke test failed: $projectName" }
    }

    if (Get-Command git -ErrorAction SilentlyContinue) {
        foreach ($ignoredProbe in @(
            '.tools/gbdk/bin/lcc.exe',
            '.downloads/gbdk-win64.zip',
            'projects/hello-gb/build/Debug/hello-gb.gb'
        )) {
            & git -C $root -c ("safe.directory={0}" -f ($root -replace '\\', '/')) check-ignore -q -- $ignoredProbe
            if ($LASTEXITCODE -ne 0) { throw "Expected path is not ignored by Git: $ignoredProbe" }
        }

        $tracked = @(& git -C $root -c ("safe.directory={0}" -f ($root -replace '\\', '/')) ls-files)
        if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }
        $trackedIgnored = @(& git -C $root -c ("safe.directory={0}" -f ($root -replace '\\', '/')) ls-files -ci --exclude-standard)
        if ($LASTEXITCODE -ne 0) { throw 'git tracked-ignore inspection failed.' }
        if ($trackedIgnored.Count -gt 0) {
            throw "Files matched by .gitignore are already tracked: $($trackedIgnored -join ', ')"
        }
        foreach ($path in $tracked) {
            $normalized = $path -replace '\\', '/'
            if (($normalized -match '^(?:\.tools|\.downloads|\.cache)/') -or
                ($normalized -match '(^|/)build/') -or
                (($normalized -match '(^|/)generated/') -and $normalized -notmatch '/generated/\.gitkeep$') -or
                ($normalized -match '(?i)\.(?:gb|gbc|sav|srm|rtc|state|cdb|noi|sym|map|rel|o|obj)$')) {
                throw "Forbidden generated/downloaded file is tracked by Git: $path"
            }
        }

        $statusLines = @(& git -C $root -c ("safe.directory={0}" -f ($root -replace '\\', '/')) status --porcelain=v1 --untracked-files=all)
        if ($LASTEXITCODE -ne 0) { throw 'git status inspection failed.' }
        foreach ($line in $statusLines) {
            if ($line.Length -lt 4) { continue }
            $path = $line.Substring(3).Trim('"') -replace '\\', '/'
            if (($path -match '^(?:\.tools|\.downloads|\.cache)/') -or ($path -match '(^|/)build/') -or ($path -match '(?i)\.(?:gb|gbc|sav|state)$')) {
                throw "Generated/downloaded path appears as a Git tracking candidate: $path"
            }
        }
    }
    $editorNode = Join-Path $root '.tools\node\node.exe'
    Invoke-CheckedCommand -FilePath $editorNode -ArgumentList @((Join-Path $root 'editor\node_modules\typescript\bin\tsc'),'--noEmit','-p',(Join-Path $root 'editor\tsconfig.json')) -WorkingDirectory $root
    $editorTests = @('--test',(Join-Path $root 'editor\tests\core.test.mjs'))
    if ($projects -contains 'star-caravan') {
        $editorTests += (Join-Path $root 'editor\tests\rom.test.mjs')
        $editorTests += (Join-Path $root 'editor\tests\bgb.test.mjs')
    }
    Invoke-CheckedCommand -FilePath $editorNode -ArgumentList $editorTests -WorkingDirectory $root
    Write-Check OK 'All tests passed'
    exit 0
}
catch {
    Write-Check FAIL $_.Exception.Message
    exit 1
}
