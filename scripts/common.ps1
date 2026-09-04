Set-StrictMode -Version 2.0

function Get-RepoRoot {
    $root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    if ([System.IO.Path]::GetPathRoot($root) -eq $root) {
        throw "Repository root resolved to a drive root: $root"
    }
    return $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

function Write-Check {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('OK', 'WARN', 'FAIL', 'INFO')][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )
    $colors = @{ OK = 'Green'; WARN = 'Yellow'; FAIL = 'Red'; INFO = 'Cyan' }
    Write-Host ("[{0}] {1}" -f $Status, $Message) -ForegroundColor $colors[$Status]
}

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    $stream = [System.IO.File]::OpenRead($Path)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $algorithm.ComputeHash($stream)
        return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory = $true)][string]$BaseDirectory,
        [Parameter(Mandatory = $true)][string]$Path
    )
    $baseFull = [System.IO.Path]::GetFullPath($BaseDirectory).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    $pathFull = [System.IO.Path]::GetFullPath($Path)
    $baseUri = New-Object System.Uri($baseFull)
    $pathUri = New-Object System.Uri($pathFull)
    if ($baseUri.Scheme -ne $pathUri.Scheme) { return $pathFull }
    $relative = [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString())
    return $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
}

function ConvertTo-WindowsCommandLineArgument {
    param([AllowEmptyString()][string]$Argument)
    if ($Argument -notmatch '[\s"]') { return $Argument }
    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append('"')
    $backslashes = 0
    foreach ($character in $Argument.ToCharArray()) {
        if ($character -eq '\') {
            ++$backslashes
        }
        elseif ($character -eq '"') {
            [void]$builder.Append(('\' * (($backslashes * 2) + 1)))
            [void]$builder.Append('"')
            $backslashes = 0
        }
        else {
            if ($backslashes -gt 0) { [void]$builder.Append(('\' * $backslashes)); $backslashes = 0 }
            [void]$builder.Append($character)
        }
    }
    if ($backslashes -gt 0) { [void]$builder.Append(('\' * ($backslashes * 2))) }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function ConvertTo-WindowsCommandLine {
    param([Parameter(Mandatory = $true)][object[]]$ArgumentList)
    return (($ArgumentList | ForEach-Object { ConvertTo-WindowsCommandLineArgument -Argument ([string]$_) }) -join ' ')
}

function Test-PathInsideRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )
    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    return $fullPath.StartsWith($fullRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparsePointsBelowRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )
    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    if (-not $fullPath.StartsWith($fullRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the repository: $fullPath"
    }
    $relative = $fullPath.Substring($fullRoot.Length).TrimStart('\', '/')
    $current = $fullRoot
    foreach ($component in ($relative -split '[\\/]+')) {
        if (-not $component) { continue }
        $current = Join-Path $current $component
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Refusing a workspace path that traverses a reparse point: $current"
            }
        }
    }
}

function Remove-SafeTree {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )
    if (-not (Test-PathInsideRoot -Path $Path -Root $Root)) {
        throw "Refusing to remove a path outside the repository: $Path"
    }
    Assert-NoReparsePointsBelowRoot -Path $Path -Root $Root
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Read-ToolsLock {
    param([Parameter(Mandatory = $true)][string]$Root)
    $lockPath = Join-Path $Root 'config\tools.lock.json'
    if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
        throw "Tool lock file is missing: $lockPath"
    }
    try {
        $lock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        throw "Tool lock file is invalid JSON: $($_.Exception.Message)"
    }
    if ($lock.schemaVersion -ne 1 -or -not $lock.tools) {
        throw 'Unsupported or incomplete tool lock schema.'
    }
    return $lock
}

function Get-ProjectDefinition {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Project
    )
    if (($Project -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') -or $Project.Contains('..')) {
        throw "Invalid project name: $Project"
    }
    $projectDir = Join-Path (Join-Path $Root 'projects') $Project
    if (-not (Test-PathInsideRoot -Path $projectDir -Root $Root)) {
        throw "Project resolved outside the repository: $Project"
    }
    Assert-NoReparsePointsBelowRoot -Path $projectDir -Root $Root
    $definitionPath = Join-Path $projectDir 'project.json'
    if (-not (Test-Path -LiteralPath $definitionPath -PathType Leaf)) {
        throw "Project definition not found: $definitionPath"
    }
    try {
        $definition = Get-Content -LiteralPath $definitionPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        throw "Invalid project.json for '$Project': $($_.Exception.Message)"
    }
    if ($definition.name -ne $Project -or $definition.toolchain -ne 'gbdk' -or -not $definition.output -or -not $definition.sources) {
        throw "Project definition is missing required GBDK fields: $definitionPath"
    }
    return [PSCustomObject]@{
        Directory = $projectDir
        Definition = $definition
        DefinitionPath = $definitionPath
    }
}

function Get-ToolInstallPath {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)]$Tool
    )
    $path = [System.IO.Path]::GetFullPath((Join-Path $Root ([string]$Tool.installDir)))
    if (-not (Test-PathInsideRoot -Path $path -Root $Root)) {
        throw "Tool install path is outside the repository: $path"
    }
    Assert-NoReparsePointsBelowRoot -Path $path -Root $Root
    return $path
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory
    )
    if ($WorkingDirectory) {
        Push-Location -LiteralPath $WorkingDirectory
    }
    try {
        & $FilePath @ArgumentList
        $exitCode = $LASTEXITCODE
    }
    finally {
        if ($WorkingDirectory) {
            Pop-Location
        }
    }
    if ($null -eq $exitCode) { $exitCode = 0 }
    if ($exitCode -ne 0) {
        throw "Command failed with exit code $exitCode`: $FilePath $($ArgumentList -join ' ')"
    }
}

function Invoke-RepoGit {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList
    )
    & git -C $Root -c ("safe.directory={0}" -f ($Root -replace '\\', '/')) @ArgumentList
    return $LASTEXITCODE
}
