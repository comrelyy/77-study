param([string]$VoiceName = 'Microsoft Zira Desktop - English (United States)')
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$staticRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'static'))
$pack = Get-Content -LiteralPath (Join-Path $staticRoot 'dev/content/picnic.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$ids = @($pack.modules.story[0].segments | ForEach-Object { $_.audio })
$ids += @($pack.modules.dialogue[0].question | ForEach-Object { $_.audio })
foreach ($option in $pack.modules.dialogue[0].options) { $ids += $option.audio; $ids += @($option.followUp | ForEach-Object { $_.audio }) }
$ids += $pack.words[0].audio
$voice = New-Object -ComObject SAPI.SpVoice
$tokens = $voice.GetVoices()
$chosen = $null
for ($i=0; $i -lt $tokens.Count; $i++) { if ($tokens.Item($i).GetDescription() -eq $VoiceName) { $chosen=$tokens.Item($i); break } }
if ($null -eq $chosen) { throw "Requested English voice is unavailable: $VoiceName" }
if ($chosen.GetAttribute('Language') -notmatch '(^|;)409(;|$)') { throw 'An en-US voice is required.' }
$voice.Voice = $chosen
$voice.Volume = 90
$entries = @()
foreach ($id in ($ids | Select-Object -Unique)) {
    $asset = $pack.assets | Where-Object { $_.id -eq $id }
    if ($null -eq $asset -or $asset.kind -ne 'audio') { throw "Invalid audio reference: $id" }
    $outputPath = [IO.Path]::GetFullPath((Join-Path $staticRoot $asset.path))
    if (!$outputPath.StartsWith(($staticRoot + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) { throw 'Audio path escaped static directory.' }
    if (Test-Path -LiteralPath $outputPath) { throw "Refusing to overwrite existing audio: $outputPath" }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
    $temporaryPath = $outputPath + '.partial-' + [Guid]::NewGuid().ToString('N')
    $stream = New-Object -ComObject SAPI.SpFileStream
    try {
        try {
            $stream.Open($temporaryPath, 3, $false)
            $voice.AudioOutputStream = $stream
            $voice.Rate = $(if ($asset.role -eq 'bunny') { -1 } else { -2 })
            $voice.Speak($asset.text, 0) | Out-Null
        } finally { $stream.Close() }
        if ((Get-Item -LiteralPath $temporaryPath).Length -le 44) { throw 'No audio data was generated.' }
        [IO.File]::Move($temporaryPath, $outputPath)
    } finally { if (Test-Path -LiteralPath $temporaryPath) { [IO.File]::Delete($temporaryPath) } }
    $entries += [ordered]@{ id=$id; path=$asset.path; text=$asset.text; language=$asset.language; role=$asset.role;
        voice=$chosen.GetDescription(); rate=$voice.Rate; volume=$voice.Volume;
        sha256=(Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest = [ordered]@{ schemaVersion=1; sceneId=$pack.sceneId; contentVersion=$pack.contentVersion;
    generatedAt=[DateTime]::UtcNow.ToString('o'); source='Windows SAPI offline synthesis';
    purpose='S1 internal audition sample; not approved for distribution';
    rightsStatus='pending review'; reviewed=$false; entries=$entries }
$manifestPath = Join-Path $staticRoot 'audio/s1-sample-manifest.json'
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Output "Generated $($entries.Count) internal sample files. Listening and source/rights review remain required."
