param([string]$SceneId = 'picnic', [switch]$All)
# Same Kokoro synthesis as macOS (momo_agent quiz-audio); run scripts\download-kokoro.py once first.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ($SceneId -notmatch '^[a-z0-9-]+$') { throw 'Invalid scene ID.' }
$python = if (Test-Path '.venv\Scripts\python.exe') { '.\.venv\Scripts\python.exe' } else { 'py' }
$arguments = @('-m', 'momo_agent', 'quiz-audio', $SceneId)
if ($All) { $arguments += '--all' }
& $python @arguments
if ($LASTEXITCODE -ne 0) { throw "Audio synthesis failed for $SceneId." }
