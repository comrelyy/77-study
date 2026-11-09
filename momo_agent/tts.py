"""Render pack audio with the OS speech engine: macOS `say` or Windows SAPI."""
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

MAC_VOICE = "Samantha (macOS say)"
MAC_RATES = {"narrator": 150, "momo": 150, "bunny": 165, "fox": 175, "turtle": 135}
WIN_VOICE = "Microsoft Zira Desktop - English (United States)"
WIN_RATES = {"narrator": -2, "momo": -2, "bunny": -1, "fox": 0, "turtle": -3}

# The text, rate and output path are read from environment variables,
# so nothing the pack says is ever part of the command line.
WIN_SCRIPT = f"""
$ErrorActionPreference = 'Stop'
$voice = New-Object -ComObject SAPI.SpVoice
$chosen = $null
for ($i = 0; $i -lt $voice.GetVoices().Count; $i++) {{
    if ($voice.GetVoices().Item($i).GetDescription() -eq '{WIN_VOICE}') {{ $chosen = $voice.GetVoices().Item($i); break }}
}}
if ($null -eq $chosen) {{ throw 'Requested English voice is unavailable.' }}
$voice.Voice = $chosen
$voice.Volume = 90
$voice.Rate = [int]$env:MOMO_TTS_RATE
$format = New-Object -ComObject SAPI.SpAudioFormat
$format.Type = 22
$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Format = $format
try {{
    $stream.Open($env:MOMO_TTS_OUT, 3, $false)
    $voice.AudioOutputStream = $stream
    $voice.Speak($env:MOMO_TTS_TEXT, 0) | Out-Null
}} finally {{ $stream.Close() }}
"""


def synthesize(text: str, role: str, out: Path) -> dict:
    """Speak `text` into the wav file `out`; return the voice/rate/volume for the manifest."""
    if sys.platform == "darwin":
        rate = MAC_RATES.get(role, 150)
        subprocess.run(
            ["say", "-v", "Samantha", "-r", str(rate), "--file-format=WAVE",
             "--data-format=LEI16@22050", "-o", str(out), "--", text],
            check=True)
        return {"voice": MAC_VOICE, "rate": rate, "volume": 100}
    if sys.platform == "win32":
        rate = WIN_RATES.get(role, -2)
        env = {**os.environ, "MOMO_TTS_TEXT": text, "MOMO_TTS_RATE": str(rate), "MOMO_TTS_OUT": str(Path(out).resolve())}
        subprocess.run(["powershell", "-NoProfile", "-Command", WIN_SCRIPT], env=env, check=True)
        return {"voice": WIN_VOICE, "rate": rate, "volume": 90}
    raise RuntimeError(f"No speech engine for platform {sys.platform}")


def render_audio(pack: dict, static_root: Path) -> dict:
    """Synthesize every audio asset of the pack and write its audio manifest."""
    static_root = Path(static_root)
    entries = []
    for asset in pack["assets"]:
        if asset["kind"] != "audio":
            continue
        out = static_root / asset["path"]
        out.parent.mkdir(parents=True, exist_ok=True)
        info = synthesize(asset["text"], asset["role"], out)
        entries.append({
            "id": asset["id"], "path": asset["path"], "text": asset["text"],
            "language": asset["language"], "role": asset["role"], **info,
            "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
        })
    manifest = {
        "schemaVersion": 1, "sceneId": pack["sceneId"], "contentVersion": pack["contentVersion"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Local offline speech synthesis",
        "purpose": "Local synthesis; listening and rights review pending",
        "rightsStatus": "pending review", "reviewed": False, "entries": entries,
    }
    path = static_root / "audio" / f"s4-{pack['sceneId']}-manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def render_missing_audio(pack: dict, static_root: Path) -> list[Path]:
    """Synthesize only the audio assets whose file is missing and add them to the theme's audio manifest."""
    static_root = Path(static_root)
    written, entries = [], []
    # picnic is the original theme; its manifest has no scene id in the name (same rule as content-audit.cjs)
    name = "s4-manifest.json" if pack["sceneId"] == "picnic" else f"s4-{pack['sceneId']}-manifest.json"
    manifest_path = static_root / "audio" / name
    for asset in pack["assets"]:
        out = static_root / asset["path"]
        if asset["kind"] != "audio" or out.exists():
            continue
        if not manifest_path.exists():
            raise RuntimeError(f"找不到音频清单 {name}，无法登记新合成的题目读音。")
        out.parent.mkdir(parents=True, exist_ok=True)
        info = synthesize(asset["text"], asset["role"], out)
        entries.append({
            "id": asset["id"], "path": asset["path"], "text": asset["text"],
            "language": asset["language"], "role": asset["role"], **info,
            "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
        })
        written.append(out)
    if entries:
        path = manifest_path
        manifest = json.loads(path.read_text("utf-8"))
        new_ids = {e["id"] for e in entries}
        manifest["entries"] = [e for e in manifest["entries"] if e["id"] not in new_ids] + entries
        path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return written
