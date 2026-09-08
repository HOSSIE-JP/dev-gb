param(
    [string]$OptionalTools = '',
    [switch]$List,
    [switch]$Packaged,
    [switch]$Force,
    [switch]$Offline,
    [switch]$UpdateLock,
    [switch]$SkipExtensions,
    [switch]$SkipDoctor
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'setup-policy.ps1')
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$previousCodePortable = $env:VSCODE_PORTABLE
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Save-LockAtomically {
    param($Lock, [string]$LockPath, [string]$CacheRoot)
    Ensure-Directory -Path $CacheRoot
    if (Test-Path -LiteralPath $LockPath) {
        Copy-Item -LiteralPath $LockPath -Destination (Join-Path $CacheRoot 'tools.lock.backup.json') -Force
    }
    $temporary = Join-Path $CacheRoot ("tools.lock.{0}.tmp" -f [Guid]::NewGuid().ToString('N'))
    $json = $Lock | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText($temporary, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $LockPath -Force
}

function Test-ZipSafety {
    param([string]$ArchivePath)
    $stream = [System.IO.File]::OpenRead($ArchivePath)
    try {
        $zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
        try {
            if ($zip.Entries.Count -eq 0) { throw "ZIP archive is empty: $ArchivePath" }
            $probeRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) 'gbdev-zip-probe')).TrimEnd('\') + '\'
            foreach ($entry in $zip.Entries) {
                $name = $entry.FullName -replace '/', '\'
                if ([System.IO.Path]::IsPathRooted($name) -or $name -match '(^|\\)\.\.(\\|$)' -or $name.IndexOf([char]0) -ge 0) {
                    throw "Unsafe ZIP entry: $($entry.FullName)"
                }
                $resolved = [System.IO.Path]::GetFullPath((Join-Path $probeRoot $name))
                if (-not $resolved.StartsWith($probeRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                    throw "ZIP entry escapes extraction root: $($entry.FullName)"
                }
            }
        }
        finally { $zip.Dispose() }
    }
    catch [System.IO.InvalidDataException] {
        throw "Downloaded file is not a valid ZIP archive: $ArchivePath"
    }
    finally { $stream.Dispose() }
}

function Invoke-VerifiedHttpDownload {
    param([string]$Uri, [string]$Destination)
    $request = [System.Net.HttpWebRequest]::Create($Uri)
    $request.Method = 'GET'
    $request.UserAgent = 'gb-dev-portable-bootstrap'
    $request.AllowAutoRedirect = $true
    $request.MaximumAutomaticRedirections = 10
    $request.Timeout = 300000
    $request.ReadWriteTimeout = 300000
    $response = $null
    $responseStream = $null
    $fileStream = $null
    try {
        $response = [System.Net.HttpWebResponse]$request.GetResponse()
        $contentType = [string]$response.ContentType
        $finalUrl = [string]$response.ResponseUri.AbsoluteUri
        if ($contentType -match '(?i)(?:text/html|application/xhtml\+xml)') {
            throw "Server returned HTML instead of an archive: $finalUrl ($contentType)"
        }
        if ($finalUrl -notmatch '^https://') { throw "Download redirected to a non-HTTPS URL: $finalUrl" }
        $responseStream = $response.GetResponseStream()
        $fileStream = New-Object System.IO.FileStream($Destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $responseStream.CopyTo($fileStream)
        $fileStream.Flush()
        return [PSCustomObject]@{ ContentType = $contentType; FinalUrl = $finalUrl }
    }
    finally {
        if ($fileStream) { $fileStream.Dispose() }
        if ($responseStream) { $responseStream.Dispose() }
        if ($response) { $response.Dispose() }
    }
}

function Download-LockedZip {
    param(
        [string]$Name,
        $Tool,
        [string]$Destination,
        [bool]$RefreshHash
    )
    $expectedHash = ([string]$Tool.sha256).ToLowerInvariant()
    if ((Test-Path -LiteralPath $Destination -PathType Leaf) -and $Force -and $Offline) {
        $cachedHash = Get-Sha256 -Path $Destination
        if (($expectedHash -notmatch '^[0-9a-f]{64}$') -or $cachedHash -ne $expectedHash) {
            throw "Offline force mode: cached archive hash does not match the lock for $Name"
        }
        Test-ZipSafety -ArchivePath $Destination
        Write-Check OK "Using verified cached archive to force reinstall $Name"
        return [PSCustomObject]@{ Hash = $cachedHash; FinalUrl = [string]$Tool.url }
    }
    if ((Test-Path -LiteralPath $Destination -PathType Leaf) -and (-not $Force)) {
        if ($UpdateLock) {
            Write-Check INFO "Refreshing cached archive for $Name"
        }
        else {
            $cachedHash = Get-Sha256 -Path $Destination
            if (($expectedHash -match '^[0-9a-f]{64}$') -and $cachedHash -eq $expectedHash) {
                Test-ZipSafety -ArchivePath $Destination
                Write-Check OK "Using verified cached archive for $Name"
                return [PSCustomObject]@{ Hash = $cachedHash; FinalUrl = [string]$Tool.url }
            }
            if ($RefreshHash -and $expectedHash -notmatch '^[0-9a-f]{64}$') {
                Test-ZipSafety -ArchivePath $Destination
                Write-Check INFO "Hashing existing initial archive for $Name"
                return [PSCustomObject]@{ Hash = $cachedHash; FinalUrl = [string]$Tool.url }
            }
        }
    }
    if ($Offline) { throw "Offline mode: verified archive is unavailable for $Name at $Destination" }

    $partial = $Destination + '.part-' + [Guid]::NewGuid().ToString('N')
    try {
        Write-Check INFO "Downloading $Name $($Tool.version)"
        Write-Host ("URL: {0}" -f $Tool.url)
        $response = Invoke-VerifiedHttpDownload -Uri ([string]$Tool.url) -Destination $partial
        if (-not (Test-Path -LiteralPath $partial -PathType Leaf)) { throw "Download did not create a file for $Name" }
        $download = Get-Item -LiteralPath $partial
        if ($download.Length -lt 1024) { throw "Downloaded archive is unexpectedly small for $Name ($($download.Length) bytes)" }
        Test-ZipSafety -ArchivePath $partial
        $actualHash = Get-Sha256 -Path $partial
        $officialHash = ([string]$Tool.checksumSource) -eq 'official'
        if (($expectedHash -match '^[0-9a-f]{64}$') -and ((-not $RefreshHash) -or $officialHash) -and $actualHash -ne $expectedHash) {
            throw "SHA-256 mismatch for $Name. Expected $expectedHash, got $actualHash"
        }
        Move-Item -LiteralPath $partial -Destination $Destination -Force
        return [PSCustomObject]@{ Hash = $actualHash; FinalUrl = [string]$response.FinalUrl }
    }
    finally {
        if (Test-Path -LiteralPath $partial) { Remove-SafeTree -Path $partial -Root $root }
    }
}

function Resolve-LatestMetadata {
    param([string]$Name, $Tool)
    $sourceType = [string]$Tool.source.type
    if ($sourceType -eq 'fixed-download') {
        Write-Check INFO "Preserving explicitly pinned dependency: $Name $($Tool.version)"
        $Tool.url = [string]$Tool.source.downloadUrl
    }
    elseif ($sourceType -eq 'github-release') {
        Write-Check INFO "Resolving latest stable release for $Name"
        $release = Invoke-RestMethod -Uri ([string]$Tool.source.apiUrl) -Headers @{ 'User-Agent' = 'gb-dev-portable-bootstrap'; 'Accept' = 'application/vnd.github+json' }
        if ($release.draft -or $release.prerelease) { throw "GitHub latest release for $Name is not stable." }
        $matches = @($release.assets | Where-Object { $_.name -match ([string]$Tool.source.assetRegex) })
        if ($matches.Count -ne 1) { throw "Expected one Windows x64 ZIP for $Name, found $($matches.Count)." }
        $Tool.version = ([string]$release.tag_name) -replace '^(?:gbdk-|v)', ''
        $Tool.url = [string]$matches[0].browser_download_url
        $Tool.archive = [string]$matches[0].name
        $digest = [string]$matches[0].digest
        if ($digest -match '^sha256:([0-9a-fA-F]{64})$') {
            $Tool.sha256 = $Matches[1].ToLowerInvariant()
            $Tool.checksumSource = 'official'
        }
        else {
            $Tool.sha256 = ''
            $Tool.checksumSource = 'computed'
        }
    }
    elseif ($sourceType -eq 'bgb-page') {
        Write-Check INFO 'Resolving latest stable release for BGB'
        $page = Invoke-WebRequest -Uri ([string]$Tool.source.pageUrl) -UseBasicParsing -Headers @{ 'User-Agent' = 'gb-dev-portable-bootstrap' }
        $match = [regex]::Match([string]$page.Content, 'current\s+version\s*:\s*BGB\s*([0-9]+(?:\.[0-9]+)+)', 'IgnoreCase')
        if (-not $match.Success) { throw 'Could not resolve BGB version from its official page.' }
        $Tool.version = $match.Groups[1].Value
        $Tool.url = [string]$Tool.source.downloadUrl
        $Tool.archive = 'bgbw64.zip'
        $Tool.sha256 = ''
        $Tool.checksumSource = 'computed'
    }
    elseif ($sourceType -eq 'vscode-update') {
        Write-Check INFO 'Resolving latest stable release for VS Code'
        $metadata = Invoke-RestMethod -Uri ([string]$Tool.source.apiUrl) -Headers @{ 'User-Agent' = 'gb-dev-portable-bootstrap' }
        $resolvedVersion = if ($metadata.productVersion) { [string]$metadata.productVersion } elseif ($metadata.name) { [string]$metadata.name } else { throw 'VS Code update API did not return a version.' }
        $Tool.version = $resolvedVersion
        $Tool.url = if (([string]$metadata.url -match '^https://')) { [string]$metadata.url } else { "https://update.code.visualstudio.com/$resolvedVersion/win32-x64-archive/stable" }
        $archiveFromUrl = [System.IO.Path]::GetFileName(([System.Uri]$Tool.url).AbsolutePath)
        $Tool.archive = if ($archiveFromUrl -match '(?i)\.zip$') { $archiveFromUrl } else { "VSCode-win32-x64-$resolvedVersion.zip" }
        if (([string]$metadata.sha256hash) -match '^[0-9a-fA-F]{64}$') {
            $Tool.sha256 = ([string]$metadata.sha256hash).ToLowerInvariant()
            $Tool.checksumSource = 'official'
        }
        else {
            $Tool.sha256 = ''
            $Tool.checksumSource = 'computed'
        }
    }
    elseif ($sourceType -eq 'static-download') {
        $Tool.version = 'pending-detection'
        $Tool.url = [string]$Tool.source.downloadUrl
        $Tool.sha256 = ''
        $Tool.checksumSource = 'computed'
    }
    else {
        throw "Unknown update source type for $Name`: $sourceType"
    }
}

function Find-PayloadRoot {
    param([string]$ExtractionRoot, [object[]]$ExpectedPaths)
    $directories = @((Get-Item -LiteralPath $ExtractionRoot)) + @(Get-ChildItem -LiteralPath $ExtractionRoot -Directory -Recurse)
    $candidates = foreach ($directory in $directories) {
        $allPresent = $true
        foreach ($relative in $ExpectedPaths) {
            if (-not (Test-Path -LiteralPath (Join-Path $directory.FullName ([string]$relative)))) { $allPresent = $false; break }
        }
        if ($allPresent) { $directory }
    }
    $candidate = $candidates | Sort-Object { $_.FullName.Length } | Select-Object -First 1
    if (-not $candidate) { throw "Archive payload does not contain expected files: $($ExpectedPaths -join ', ')" }
    return $candidate.FullName
}

function Install-ZipTool {
    param([string]$Name, $Tool, [string]$ArchivePath)
    $installPath = Get-ToolInstallPath -Root $root -Tool $Tool
    $staging = Join-Path $bootstrapCache ("extract-{0}-{1}" -f $Name, [Guid]::NewGuid().ToString('N'))
    $backup = Join-Path $bootstrapCache ("backup-{0}-{1}" -f $Name, [Guid]::NewGuid().ToString('N'))
    $preserveRoot = Join-Path $bootstrapCache ("preserve-{0}-{1}" -f $Name, [Guid]::NewGuid().ToString('N'))
    $preservePaths = if ($Name -eq 'vscode') { @('data') } else { @() }
    Ensure-Directory -Path $staging
    try {
        Test-ZipSafety -ArchivePath $ArchivePath
        [System.IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath, $staging)
        $payloadRoot = Find-PayloadRoot -ExtractionRoot $staging -ExpectedPaths $Tool.expectedPaths
        Ensure-Directory -Path (Split-Path -Parent $installPath)
        $hadExisting = Test-Path -LiteralPath $installPath
        try {
            if ($hadExisting) {
                foreach ($relative in $preservePaths) {
                    $existingPreserve = Join-Path $installPath $relative
                    if (Test-Path -LiteralPath $existingPreserve) {
                        Ensure-Directory -Path $preserveRoot
                        Move-Item -LiteralPath $existingPreserve -Destination (Join-Path $preserveRoot $relative)
                    }
                }
                Move-Item -LiteralPath $installPath -Destination $backup
            }
            Move-Item -LiteralPath $payloadRoot -Destination $installPath
            foreach ($relative in $preservePaths) {
                $preserved = Join-Path $preserveRoot $relative
                if (Test-Path -LiteralPath $preserved) {
                    $restoreTarget = Join-Path $installPath $relative
                    if (Test-Path -LiteralPath $restoreTarget) { throw "New $Name payload unexpectedly contains preserved path: $relative" }
                    Move-Item -LiteralPath $preserved -Destination $restoreTarget
                }
            }
            foreach ($relative in $Tool.expectedPaths) {
                if (-not (Test-Path -LiteralPath (Join-Path $installPath ([string]$relative)) -PathType Leaf)) {
                    throw "Installed $Name is missing expected file: $relative"
                }
            }
        }
        catch {
            if ($hadExisting -and (Test-Path -LiteralPath $backup)) {
                if (Test-Path -LiteralPath $installPath) { Remove-SafeTree -Path $installPath -Root $root }
                Move-Item -LiteralPath $backup -Destination $installPath
            }
            foreach ($relative in $preservePaths) {
                $preserved = Join-Path $preserveRoot $relative
                if (Test-Path -LiteralPath $preserved) {
                    Ensure-Directory -Path $installPath
                    Move-Item -LiteralPath $preserved -Destination (Join-Path $installPath $relative)
                }
            }
            throw
        }
        if (Test-Path -LiteralPath $backup) {
            try { Remove-SafeTree -Path $backup -Root $root }
            catch { Write-Check WARN "Old $Name backup remains in cache: $backup ($($_.Exception.Message))" }
        }
        if (Test-Path -LiteralPath $preserveRoot) {
            $remainingPreserved = @(Get-ChildItem -LiteralPath $preserveRoot -Force -ErrorAction SilentlyContinue)
            if ($remainingPreserved.Count -eq 0) {
                Remove-SafeTree -Path $preserveRoot -Root $root
            }
            else {
                Write-Check WARN "Preserved $Name data remains in cache: $preserveRoot"
            }
        }
        Write-Check OK "Installed $Name into $installPath"
        return $installPath
    }
    finally {
        if (Test-Path -LiteralPath $staging) { Remove-SafeTree -Path $staging -Root $root }
    }
}

function Get-DetectedVersion {
    param([string]$Name, [string]$InstallPath, [string]$Fallback)
    if ($Name -eq 'vscode') {
        $packagePath = Join-Path $InstallPath 'resources\app\package.json'
        if (Test-Path -LiteralPath $packagePath) {
            return [string]((Get-Content -LiteralPath $packagePath -Raw -Encoding UTF8 | ConvertFrom-Json).version)
        }
    }
    elseif ($Name -eq 'bgb') {
        $value = (Get-Item -LiteralPath (Join-Path $InstallPath 'bgb64.exe')).VersionInfo.ProductVersion
        if ($value) { return ([string]$value).Trim() }
    }
    elseif ($Name -eq 'emulicious') {
        $whatsNew = Join-Path $InstallPath 'WhatsNew.txt'
        if (Test-Path -LiteralPath $whatsNew) {
            $text = Get-Content -LiteralPath $whatsNew -Raw -Encoding UTF8
            $date = [regex]::Match($text, '(?m)\b(20[0-9]{2}-[0-9]{2}-[0-9]{2})\b')
            if ($date.Success) { return $date.Groups[1].Value }
        }
        $jarPath = Join-Path $InstallPath 'Emulicious.jar'
        $stream = [System.IO.File]::OpenRead($jarPath)
        try {
            $jar = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
            try {
                $manifest = $jar.GetEntry('META-INF/MANIFEST.MF')
                if ($manifest) {
                    $reader = New-Object System.IO.StreamReader($manifest.Open())
                    try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
                    foreach ($pattern in @('(?im)^Implementation-Version:\s*(.+)$', '(?im)^Build-Time:\s*(.+)$', '(?im)^Build-Date:\s*(.+)$')) {
                        $match = [regex]::Match($content, $pattern)
                        if ($match.Success) { return $match.Groups[1].Value.Trim() }
                    }
                }
            }
            finally { $jar.Dispose() }
        }
        finally { $stream.Dispose() }
    }
    return $Fallback
}

function Write-InstallMarker {
    param([string]$InstallPath, $Tool)
    $fileHashes = [ordered]@{}
    foreach ($relative in $Tool.expectedPaths) {
        $key = ([string]$relative) -replace '\\', '/'
        $fileHashes[$key] = Get-Sha256 -Path (Join-Path $InstallPath ([string]$relative))
    }
    $marker = [ordered]@{
        version = [string]$Tool.version
        sha256 = [string]$Tool.sha256
        installedAtUtc = [DateTime]::UtcNow.ToString('o')
        files = $fileHashes
    }
    [System.IO.File]::WriteAllText((Join-Path $InstallPath '.gbdev-tool.json'), ($marker | ConvertTo-Json) + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
}

function Test-InstalledTool {
    param($Tool)
    $installPath = Get-ToolInstallPath -Root $root -Tool $Tool
    foreach ($relative in $Tool.expectedPaths) {
        if (-not (Test-Path -LiteralPath (Join-Path $installPath ([string]$relative)) -PathType Leaf)) { return $false }
    }
    $markerPath = Join-Path $installPath '.gbdev-tool.json'
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { return $false }
    try { $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $false }
    if (([string]$marker.version -ne [string]$Tool.version) -or ([string]$marker.sha256 -ne [string]$Tool.sha256)) { return $false }
    if (-not ($marker.PSObject.Properties.Name -contains 'files')) { return $false }
    foreach ($relative in $Tool.expectedPaths) {
        $key = ([string]$relative) -replace '\\', '/'
        $fileProperty = $marker.files.PSObject.Properties[$key]
        if (-not $fileProperty) { return $false }
        if ((Get-Sha256 -Path (Join-Path $installPath ([string]$relative))) -ne ([string]$fileProperty.Value)) { return $false }
    }
    return $true
}

try {
    if ($Offline -and $UpdateLock) { throw '-Offline and -UpdateLock cannot be combined.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $root = Get-RepoRoot
    $selectedTools = @(Get-SetupSelection -OptionalTools $OptionalTools)
    if ($Packaged) { $selectedTools = @($selectedTools | Where-Object { $_ -ne 'electron' }) }
    $lock = Read-ToolsLock -Root $root
    foreach ($name in $selectedTools) {
        if (-not $lock.tools.PSObject.Properties[$name]) { throw "Missing lock entry: $name" }
        $entry = $lock.tools.$name
        Write-Host (Get-SetupDescription $name)
        Write-Host ("  {0} -> {1}" -f $entry.url, $entry.installDir)
    }
    if ($List) { exit 0 }
    $downloads = Join-Path $root '.downloads'
    $bootstrapCache = Join-Path $root '.cache\bootstrap'
    foreach ($workspacePath in @($downloads, $bootstrapCache, (Join-Path $root '.tools'), (Join-Path $root 'config'))) {
        Assert-NoReparsePointsBelowRoot -Path $workspacePath -Root $root
    }
    foreach ($directory in @($downloads, $bootstrapCache, (Join-Path $root '.tools'), (Join-Path $root '.cache\tmp'))) { Ensure-Directory -Path $directory }
    $env:TEMP = $env:TMP = Join-Path $root '.cache\tmp'
    $env:VSCODE_PORTABLE = Join-Path $root '.tools\vscode\data'
    $lockPath = Join-Path $root 'config\tools.lock.json'
    $lock = Read-ToolsLock -Root $root
    if ($lock.host -ne 'windows-x64') { throw "Unsupported lock host: $($lock.host)" }

    $incomplete = @($lock.tools.PSObject.Properties | Where-Object { $selectedTools -contains $_.Name } | Where-Object {
        ([string]$_.Value.version -eq 'unresolved') -or (([string]$_.Value.sha256) -notmatch '^[0-9a-fA-F]{64}$') -or -not ([string]$_.Value.url)
    }).Count -gt 0
    $refreshLock = [bool]$UpdateLock -or $incomplete
    if ($incomplete) { Write-Check INFO 'The lock is incomplete; resolving official stable releases for the initial bootstrap.' }
    if ($refreshLock -and $Offline) { throw 'Offline mode cannot complete an unresolved tool lock.' }

    if ($refreshLock) {
        foreach ($property in $lock.tools.PSObject.Properties) {
            if ($selectedTools -notcontains $property.Name) { continue }
            $entryIncomplete = ([string]$property.Value.version -eq 'unresolved') -or (([string]$property.Value.sha256) -notmatch '^[0-9a-fA-F]{64}$') -or -not ([string]$property.Value.url)
            if ($UpdateLock -or $entryIncomplete) {
                Resolve-LatestMetadata -Name $property.Name -Tool $property.Value
            }
        }
    }

    foreach ($property in $lock.tools.PSObject.Properties) {
        if ($selectedTools -notcontains $property.Name) { continue }
        $name = $property.Name
        $tool = $property.Value
        if ((-not $refreshLock) -and (-not $Force) -and (Test-InstalledTool -Tool $tool)) {
            Write-Check OK "$name $($tool.version) is already installed"
            continue
        }
        $archivePath = Join-Path $downloads ([string]$tool.archive)
        $downloadResult = Download-LockedZip -Name $name -Tool $tool -Destination $archivePath -RefreshHash $refreshLock
        if ($refreshLock) {
            $tool.sha256 = ([string]$downloadResult.Hash).ToLowerInvariant()
            # GitHub's final CDN URL is signed and expires; browser_download_url is
            # already a stable direct asset URL and must remain in the lock.
            if (([string]$tool.source.type) -ne 'github-release') {
                $tool.url = [string]$downloadResult.FinalUrl
            }
            if (([string]$tool.checksumSource) -ne 'official') { $tool.checksumSource = 'computed' }
        }
        $installPath = Install-ZipTool -Name $name -Tool $tool -ArchivePath $archivePath
        if ($refreshLock) {
            $fallbackVersion = if ($name -eq 'emulicious') { 'snapshot-' + [DateTime]::UtcNow.ToString('yyyy-MM-dd') } else { [string]$tool.version }
            $tool.version = Get-DetectedVersion -Name $name -InstallPath $installPath -Fallback $fallbackVersion
        }
        if ($name -eq 'vscode') {
            Ensure-Directory -Path (Join-Path $installPath 'data')
            Ensure-Directory -Path (Join-Path $installPath 'data\tmp')
        }
        Write-InstallMarker -InstallPath $installPath -Tool $tool
    }

    if ($refreshLock) {
        $lock.generatedAtUtc = [DateTime]::UtcNow.ToString('o')
        Save-LockAtomically -Lock $lock -LockPath $lockPath -CacheRoot $bootstrapCache
        Write-Check OK 'Updated config/tools.lock.json atomically'
    }

    $code = Join-Path $root '.tools\vscode\Code.exe'
    $codeCli = Join-Path $root '.tools\vscode\bin\code.cmd'
    if (($selectedTools -contains 'vscode') -and (-not $Offline) -and (-not $SkipExtensions) -and (Test-Path -LiteralPath $codeCli) -and ($lock.PSObject.Properties.Name -contains 'vscodeExtensions')) {
        $installedExtensionInventory = @(& $codeCli --list-extensions --show-versions)
        foreach ($extension in $lock.vscodeExtensions) {
            $extensionId = [string]$extension.id
            $extensionSpec = if ($UpdateLock) { $extensionId } else { "$extensionId@$($extension.version)" }
            if ((-not $UpdateLock) -and (-not $Force) -and ($installedExtensionInventory -contains $extensionSpec)) {
                Write-Check OK "VS Code extension is already installed: $extensionSpec"
                continue
            }
            Write-Check INFO "Installing portable VS Code extension: $extensionSpec"
            $global:LASTEXITCODE = 0
            & $codeCli --install-extension $extensionSpec --force
            if ($LASTEXITCODE -ne 0) {
                Write-Check WARN "VS Code extension installation failed: $extensionSpec"
            }
            elseif ($UpdateLock) {
                $extensionInventory = @(& $codeCli --list-extensions --show-versions)
                $installedLine = @($extensionInventory | Where-Object { $_ -like "$extensionId@*" } | Select-Object -First 1)
                if ($installedLine.Count -eq 1) {
                    $extension.version = ([string]$installedLine[0]).Substring($extensionId.Length + 1)
                }
            }
            $installedExtensionInventory = @(& $codeCli --list-extensions --show-versions)
        }
        if ($UpdateLock) {
            $lock.generatedAtUtc = [DateTime]::UtcNow.ToString('o')
            Save-LockAtomically -Lock $lock -LockPath $lockPath -CacheRoot $bootstrapCache
            Write-Check OK 'Updated locked VS Code extension versions'
        }
    }

    if (-not $Packaged) { & (Join-Path $PSScriptRoot 'setup-editor.ps1') -Offline:$Offline -Force:$Force }

    if (-not $SkipDoctor) {
        & (Join-Path $PSScriptRoot 'doctor.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Bootstrap completed downloads, but doctor reported a required failure.' }
    }
    Write-Check OK 'Portable Game Boy development environment is ready'
    exit 0
}
catch {
    Write-Check FAIL $_.Exception.Message
    exit 1
}

finally {
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
    $env:VSCODE_PORTABLE = $previousCodePortable
}
