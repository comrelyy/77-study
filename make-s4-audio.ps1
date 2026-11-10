param([string]$VoiceName = 'Microsoft Zira Desktop - English (United States)', [string]$SceneId = 'picnic')
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
if ($SceneId -notmatch '^[a-z0-9-]+$') { throw 'Invalid scene ID.' }
$staticRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'static'))
$pack = Get-Content -LiteralPath (Join-Path $staticRoot ('content/' + $SceneId + '.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
# Review-word audio (.lesson.review.) points at other scenes' files; it is not synthesized or listed here.
$ids = @($pack.assets | Where-Object { $_.kind -eq 'audio' -and $_.id -notlike '*.lesson.review.*' } | ForEach-Object { $_.id })
$voice = New-Object -ComObject SAPI.SpVoice
$tokens = $voice.GetVoices()
$chosen = $null
for ($i=0; $i -lt $tokens.Count; $i++) { if ($tokens.Item($i).GetDescription() -eq $VoiceName) { $chosen=$tokens.Item($i); break } }
if ($null -eq $chosen) { throw "Requested English voice is unavailable: $VoiceName" }
if ($chosen.GetAttribute('Language') -notmatch '(^|;)409(;|$)') { throw 'An en-US voice is required.' }
$voice.Voice = $chosen
$voice.Volume = 90
$entries = @()
$previousEntries = @()
foreach ($name in @('s4-manifest.json', ('s4-' + $SceneId + '-manifest.json'), 's1-sample-manifest.json')) {
    $previousPath = Join-Path $staticRoot ('audio/' + $name)
    if (Test-Path -LiteralPath $previousPath) {
        $previousEntries += @((Get-Content -LiteralPath $previousPath -Raw -Encoding UTF8 | ConvertFrom-Json).entries)
    }
}
foreach ($id in ($ids | Select-Object -Unique)) {
    $asset = $pack.assets | Where-Object { $_.id -eq $id }
    if ($null -eq $asset -or $asset.kind -ne 'audio') { throw "Invalid audio reference: $id" }
    $outputPath = [IO.Path]::GetFullPath((Join-Path $staticRoot $asset.path))
    if (!$outputPath.StartsWith(($staticRoot + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) { throw 'Audio path escaped static directory.' }
    # Files made by scripts/mac-placeholder-audio.py are temporary; re-synthesize them here.
    $placeholder = $previousEntries | Where-Object { $_.id -eq $id -and $_.path -eq $asset.path -and $_.provenanceStatus -eq 'mac placeholder' } | Select-Object -First 1
    if ($null -ne $placeholder -and (Test-Path -LiteralPath $outputPath)) { [IO.File]::Delete($outputPath) }
    if (Test-Path -LiteralPath $outputPath) {
        $fileHash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $previous = $previousEntries | Where-Object { $_.id -eq $id -and $_.path -eq $asset.path -and $_.text -eq $asset.text -and $_.sha256 -eq $fileHash } | Select-Object -First 1
        if ($null -ne $previous) { $entries += $previous }
        else { $entries += [ordered]@{ id=$id; path=$asset.path; text=$asset.text; language=$asset.language; role=$asset.role; sha256=$fileHash; voice='unknown'; provenanceStatus='pending review' } }
        continue
    }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
    $temporaryPath = $outputPath + '.partial-' + [Guid]::NewGuid().ToString('N')
    $stream = New-Object -ComObject SAPI.SpFileStream
    try {
        try {
            $stream.Open($temporaryPath, 3, $false)
            $voice.AudioOutputStream = $stream
            $voiceRates = @{ narrator=-2; momo=-2; bunny=-1; fox=0; turtle=-3 }
            $voice.Rate = $(if ($voiceRates.ContainsKey([string]$asset.role)) { $voiceRates[[string]$asset.role] } else { -2 })
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
    purpose='S4 local synthesis; listening and rights review pending';
    rightsStatus='pending review'; reviewed=$false; entries=$entries }
$manifestName = if ($SceneId -eq 'picnic') { 's4-manifest.json' } else { 's4-' + $SceneId + '-manifest.json' }
$manifestPath = Join-Path $staticRoot ('audio/' + $manifestName)
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Output "Generated $($entries.Count) internal sample files. Listening and source/rights review remain required."
