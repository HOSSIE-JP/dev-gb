Add-Type -AssemblyName System.Speech
$pvRoot = Join-Path $PSScriptRoot '.'
$pvLines = (Get-Content (Join-Path $pvRoot 'narration.json') -Raw | ConvertFrom-Json).lines
New-Item -ItemType Directory -Force (Join-Path $pvRoot 'voice') | Out-Null
$pvSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
foreach ($pvLine in $pvLines) {
  $pvSynth.SelectVoice($(if ($pvLine.speaker -eq 'reimu') { 'Microsoft Haruka Desktop' } else { 'Microsoft Ayumi' }))
  $pvSynth.Rate = 2
  $pvSynth.Volume = 100
  $pvSynth.SetOutputToWaveFile((Join-Path $pvRoot ('voice/' + $pvLine.id + '.wav')))
  $pvSynth.Speak($pvLine.spoken)
  $pvSynth.SetOutputToNull()
}
$pvSynth.Dispose()
