"""Chapter 7: run the project's own JS validator on a pack."""
import json
import subprocess
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).parent / "js" / "validate_pack.cjs"


def validate_pack(pack: dict, static_root: Path, manifest: dict | None = None) -> list[str]:
    """Return the validator's errors; an empty list means the pack is valid."""
    with tempfile.TemporaryDirectory() as tmp:
        pack_file = Path(tmp) / "pack.json"
        pack_file.write_text(json.dumps(pack, ensure_ascii=False), "utf-8")
        cmd = ["node", str(SCRIPT), str(pack_file), str(static_root)]
        if manifest is not None:
            manifest_file = Path(tmp) / "manifest.json"
            manifest_file.write_text(json.dumps(manifest), "utf-8")
            cmd += ["--audit", str(manifest_file)]
        done = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(done.stdout)["errors"]
