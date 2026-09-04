param(
    [Parameter(Mandatory = $true)][string]$RomPath,
    [string]$ProjectJson
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $RomPath -PathType Leaf)) { throw "ROM not found: $RomPath" }
[byte[]]$rom = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $RomPath))
if ($rom.Length -lt 0x150) { throw "ROM is too small to contain a Game Boy header: $($rom.Length) bytes" }

[byte[]]$logo = @(
    0xCE,0xED,0x66,0x66,0xCC,0x0D,0x00,0x0B,0x03,0x73,0x00,0x83,0x00,0x0C,0x00,0x0D,
    0x00,0x08,0x11,0x1F,0x88,0x89,0x00,0x0E,0xDC,0xCC,0x6E,0xE6,0xDD,0xDD,0xD9,0x99,
    0xBB,0xBB,0x67,0x63,0x6E,0x0E,0xEC,0xCC,0xDD,0xDC,0x99,0x9F,0xBB,0xB9,0x33,0x3E
)
for ($i = 0; $i -lt $logo.Length; $i++) {
    if ($rom[0x104 + $i] -ne $logo[$i]) { throw "Nintendo logo mismatch at header offset $i" }
}

$checksum = 0
for ($i = 0x134; $i -le 0x14C; $i++) {
    $checksum = ($checksum - $rom[$i] - 1) -band 0xFF
}
if ($checksum -ne $rom[0x14D]) {
    throw ("Header checksum mismatch: expected 0x{0:X2}, found 0x{1:X2}" -f $checksum, $rom[0x14D])
}

if ($ProjectJson) {
    $project = Get-Content -LiteralPath $ProjectJson -Raw -Encoding UTF8 | ConvertFrom-Json
    if (($project.PSObject.Properties.Name -contains 'cgbCompatibility') -and $project.cgbCompatibility -eq 'dual') {
        if ($rom[0x143] -ne 0x80) { throw ("Expected dual DMG/CGB flag 0x80, found 0x{0:X2}" -f $rom[0x143]) }
    }
}

Write-Host ("[OK] Valid Game Boy ROM: {0} ({1} bytes)" -f $RomPath, $rom.Length) -ForegroundColor Green
