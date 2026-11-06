"""Chapter 7: run the project's own JS validator on a pack."""
import json
import subprocess
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).parent / "js" / "validate_pack.cjs"


def validate_pack(pack: dict, static_root: Path, manifest: dict | None = None,
                  assume_scene_images: bool = True) -> list[str]:
    """Return the validator's errors; an empty list means the pack is valid.

    assume_scene_images=True treats the pack's own scene pictures as present (they are drawn after validation).
    """
    with tempfile.TemporaryDirectory() as tmp:
        pack_file = Path(tmp) / "pack.json"
        pack_file.write_text(json.dumps(pack, ensure_ascii=False), "utf-8")
        cmd = ["node", str(SCRIPT), str(pack_file), str(static_root)]
        if manifest is not None:
            manifest_file = Path(tmp) / "manifest.json"
            manifest_file.write_text(json.dumps(manifest), "utf-8")
            cmd += ["--audit", str(manifest_file)]
        if not assume_scene_images:
            cmd.append("--real-scenes")
        done = subprocess.run(cmd, capture_output=True, text=True)
    if done.returncode != 0:
        raise RuntimeError(f"validate_pack.cjs failed: {done.stderr.strip()}")
    return json.loads(done.stdout)["errors"]
