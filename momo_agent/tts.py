"""Render pack audio with Kokoro (kokoro-onnx), offline and identical on macOS and Windows."""
import hashlib
import json
import wave
from datetime import datetime, timezone
from pathlib import Path

# The int8 model (~92 MB, the one listened to and chosen) is only needed by the machine that synthesizes,
# so it lives outside the repo.
MODEL_DIR = Path.home() / ".cache" / "momo-kokoro"
MODEL_FILES = {
    "kokoro-v1.0.int8.onnx": "6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}
RELEASE_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
DOWNLOAD_HINT = "找不到 Kokoro 模型，请先运行：python scripts/download-kokoro.py"
VOICES = {"narrator": ("af_heart", 1.0), "momo": ("af_bella", 1.0), "bunny": ("af_nova", 1.05),
          "fox": ("am_puck", 1.1), "turtle": ("bm_george", 0.85)}
WORD_SPEED = 0.9  # a single word read on its own, slow enough to hear clearly
RATE = 22050  # same 16-bit mono format as every existing file, so players and checks are unchanged
_engine = None


def model_ready() -> bool:
    return all((MODEL_DIR / name).exists() for name in MODEL_FILES)


def _kokoro():
    global _engine
    if _engine is None:
        if not model_ready():
            raise RuntimeError(DOWNLOAD_HINT)
        from kokoro_onnx import Kokoro
        _engine = Kokoro(str(MODEL_DIR / "kokoro-v1.0.int8.onnx"), str(MODEL_DIR / "voices-v1.0.bin"))
    return _engine


def voice_for(text: str, role: str) -> tuple[str, float]:
    voice, speed = VOICES.get(role, VOICES["momo"])
    return voice, WORD_SPEED if " " not in text.strip() else speed


def synthesize(text: str, role: str, out: Path) -> dict:
    """Speak `text` into the wav file `out`; return the voice/rate/volume for the manifest."""
    import numpy as np
    voice, speed = voice_for(text, role)
    samples, rate = _kokoro().create(text, voice=voice, speed=speed, lang="en-us")
    n = int(len(samples) * RATE / rate)
    resampled = np.interp(np.linspace(0, len(samples) - 1, n), np.arange(len(samples)), samples)
    pcm = (np.clip(resampled, -1, 1) * 32767).astype("<i2").tobytes()
    with wave.open(str(out), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm)
    return {"voice": f"Kokoro {voice}", "rate": speed, "volume": 100}


def _entry(asset: dict, out: Path) -> dict:
    info = synthesize(asset["text"], asset["role"], out)
    return {
        "id": asset["id"], "path": asset["path"], "text": asset["text"],
        "language": asset["language"], "role": asset["role"], **info,
        "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
    }


def render_audio(pack: dict, static_root: Path) -> dict:
    """Synthesize every audio asset of the pack and write its audio manifest."""
    static_root = Path(static_root)
    entries = []
    for asset in pack["assets"]:
        if asset["kind"] != "audio":
            continue
        out = static_root / asset["path"]
        out.parent.mkdir(parents=True, exist_ok=True)
        entries.append(_entry(asset, out))
    manifest = {
        "schemaVersion": 1, "sceneId": pack["sceneId"], "contentVersion": pack["contentVersion"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Kokoro offline speech synthesis (kokoro-onnx, kokoro-v1.0 int8)",
        "purpose": "Local synthesis; listening and rights review pending",
        "rightsStatus": "pending review", "reviewed": False, "entries": entries,
    }
    path = static_root / "audio" / f"s4-{pack['sceneId']}-manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def manifest_name(scene_id: str) -> str:
    # picnic is the original theme; its manifest has no scene id in the name (same rule as content-audit.cjs)
    return "s4-manifest.json" if scene_id == "picnic" else f"s4-{scene_id}-manifest.json"


def render_missing_audio(pack: dict, static_root: Path, everything: bool = False) -> list[Path]:
    """Synthesize the pack's audio files that are missing (or, with `everything`, all of them) into its manifest.

    With `everything`, review-word audio (.lesson.review.) is left to the theme that owns the file, and
    files listed in the S1 sample manifest keep their user-confirmed recording."""
    static_root = Path(static_root)
    written, entries = [], []
    name = manifest_name(pack["sceneId"])
    manifest_path = static_root / "audio" / name
    s1_path = static_root / "audio" / "s1-sample-manifest.json"
    s1 = {e["path"] for e in json.loads(s1_path.read_text("utf-8"))["entries"]} if s1_path.exists() else set()
    done = {}  # path -> entry, so assets sharing one file are voiced once and all get the new hash
    for asset in pack["assets"]:
        out = static_root / asset["path"]
        if asset["kind"] != "audio" or (everything and ".lesson.review." in asset["id"]):
            continue
        if asset["path"] in done:
            entries.append({**done[asset["path"]], "id": asset["id"], "text": asset["text"], "role": asset["role"]})
            continue
        if out.exists() and (not everything or asset["path"] in s1):
            continue
        if not manifest_path.exists():
            raise RuntimeError(f"找不到音频清单 {name}，无法登记新合成的题目读音。")
        out.parent.mkdir(parents=True, exist_ok=True)
        done[asset["path"]] = _entry(asset, out)
        entries.append(done[asset["path"]])
        written.append(out)
    if entries:
        manifest = json.loads(manifest_path.read_text("utf-8"))
        new_ids = {e["id"] for e in entries}
        manifest["entries"] = [e for e in manifest["entries"] if e["id"] not in new_ids] + entries
        if everything:
            manifest["source"] = "Kokoro offline speech synthesis (kokoro-onnx, kokoro-v1.0 int8)"
            manifest["generatedAt"] = datetime.now(timezone.utc).isoformat()
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if written:
        sync_shared_entries(static_root)
    return written


def sync_shared_entries(static_root: Path) -> None:
    """Point every manifest entry whose file was voiced again (by any theme) at that file's new hash and voice."""
    paths = sorted((Path(static_root) / "audio").glob("s4-*manifest.json"))
    manifests = {p: json.loads(p.read_text("utf-8")) for p in paths}
    hashes, owners = {}, {}  # path -> hash of the file now; path -> an entry that already matches it
    for manifest in manifests.values():
        for e in manifest["entries"]:
            out = Path(static_root) / e["path"]
            if e["path"] not in hashes and out.exists():
                hashes[e["path"]] = hashlib.sha256(out.read_bytes()).hexdigest()
            if e.get("sha256") == hashes.get(e["path"]):
                owners[e["path"]] = e
    for path, manifest in manifests.items():
        changed = False
        for i, e in enumerate(manifest["entries"]):
            owner = owners.get(e["path"])
            if owner and e.get("sha256") != owner["sha256"]:
                manifest["entries"][i] = {**{k: v for k, v in e.items() if k != "provenanceStatus"},
                                          **{k: owner[k] for k in ("voice", "rate", "volume", "sha256")}}
                changed = True
        if changed:
            path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
