# Shared by interactive setup, bootstrap and its network-free policy test.
function Get-SetupSelection {
    param([string]$OptionalTools = '')
    $selected = @('node', 'electron', 'misaki', 'gbdk')
    foreach ($value in ($OptionalTools -split ',')) {
        $name = $value.Trim().ToLowerInvariant()
        if (-not $name) { continue }
        if (@('bgb', 'emulicious', 'rgbds', 'vscode') -notcontains $name) {
            throw "Unknown optional tool '$name'. Choose bgb, emulicious, rgbds, vscode."
        }
        if ($selected -notcontains $name) { $selected += $name }
    }
    return $selected
}
function Get-SetupDescription {
    param([string]$Name)
    switch ($Name) {
        'node' { 'Node.js: MIT and bundled third-party terms' }
        'electron' { 'Electron: MIT and Chromium third-party terms' }
        'misaki' { 'Misaki: commercial/non-commercial font use permitted' }
        'gbdk' { 'GBDK: component licenses; runtime linking exception' }
        'bgb' { 'BGB: official download; review author usage terms' }
        'emulicious' { 'Emulicious: PERSONAL/non-commercial use; commercial users need prior permission: https://emulicious.net/License.txt' }
        'rgbds' { 'RGBDS: MIT' }
        'vscode' { 'VS Code: Microsoft product terms; extensions have separate terms' }
        default { throw "Unknown tool '$Name'." }
    }
}
