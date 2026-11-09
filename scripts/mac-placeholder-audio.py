"""Synthesize temporary macOS `say` audio for story extra lines and order-card phrases.

Hand-written themes are voiced with Windows Zira. Until that run happens, missing
`.more` / `.label.` audio is filled with Samantha so the theme still opens on a Mac.
Each file is recorded in the theme's s4 manifest with provenanceStatus
'mac placeholder'; make-s4-audio.ps1 re-synthesizes those entries on Windows.
Usage: python3 scripts/mac-placeholder-audio.py
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from momo_agent.tts import synthesize  # noqa: E402

STATIC = ROOT / "static"
PLACEHOLDER = "mac placeholder"


def manifest_path(scene_id):
    return STATIC / "audio" / ("s4-manifest.json" if scene_id == "picnic" else f"s4-{scene_id}-manifest.json")


def main():
    if sys.platform != "darwin":
        sys.exit("Only for macOS previews; on Windows run make-s4-audio.ps1 instead.")
    catalog = json.loads((STATIC / "content" / "catalog.json").read_text(encoding="utf-8"))
    total = 0
    for scene_id, file in catalog["scenes"].items():
        pack = json.loads((STATIC / file).read_text(encoding="utf-8"))
        if pack.get("generatedBy"):
            continue
        missing = [a for a in pack["assets"] if a["kind"] == "audio"
                   and (".more" in a["id"] or ".label." in a["id"]) and not (STATIC / a["path"]).exists()]
        if not missing:
            continue
        path = manifest_path(scene_id)
        manifest = json.loads(path.read_text(encoding="utf-8"))
        for asset in missing:
            out = STATIC / asset["path"]
            out.parent.mkdir(parents=True, exist_ok=True)
            info = synthesize(asset["text"], asset["role"], out)
            manifest["entries"] = [e for e in manifest["entries"] if e["id"] != asset["id"]]
            manifest["entries"].append({
                "id": asset["id"], "path": asset["path"], "text": asset["text"],
                "language": asset["language"], "role": asset["role"], **info,
                "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
                "provenanceStatus": PLACEHOLDER,
            })
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{scene_id}: {len(missing)} placeholder files")
        total += len(missing)
    print(f"{total} placeholder files. Replace them on Windows with make-s4-audio.ps1.")


if __name__ == "__main__":
    main()
