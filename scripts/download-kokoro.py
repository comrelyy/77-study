"""Download the Kokoro speech model (~120 MB) into ~/.cache/momo-kokoro and check its sha256.

Only the machine that synthesizes audio needs it; playing the app never does.
Usage: python scripts/download-kokoro.py
If the download fails, fetch the files from the printed links in a browser into that folder and run this again.
"""
import hashlib
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from momo_agent.tts import MODEL_DIR, MODEL_FILES, RELEASE_URL  # noqa: E402


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for name, expected in MODEL_FILES.items():
        path = MODEL_DIR / name
        if path.exists() and sha256(path) == expected:
            print(f"{name}: ok")
            continue
        print(f"{name}: downloading {RELEASE_URL + name}")
        partial = path.with_suffix(path.suffix + ".partial")
        try:
            with urllib.request.urlopen(RELEASE_URL + name) as response, partial.open("wb") as f:
                shutil.copyfileobj(response, f)
        except OSError as err:
            partial.unlink(missing_ok=True)
            print(f"下载失败（{err}）。请用浏览器下载 {RELEASE_URL + name} 放到 {MODEL_DIR}，再运行一次本脚本。")
            return 1
        if sha256(partial) != expected:
            partial.unlink()
            print(f"{name} 校验不一致，已删除，请重试。")
            return 1
        partial.replace(path)
        print(f"{name}: ok")
    print(f"Kokoro 模型已就绪：{MODEL_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
