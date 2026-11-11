"""Test helpers for the day tools: a throwaway copy of the repo, and a silent stand-in for speech synthesis."""
import contextlib
import shutil
import tempfile
import wave
from pathlib import Path
from unittest import mock

from momo_agent.repo import Repo

ROOT = Path(__file__).resolve().parents[2]
SKIP_NAMES = {".git", ".venv", "reports", "__pycache__", ".superpowers"}
SKIP_PATHS = {"static/audio", "static/content/archive"}


@contextlib.contextmanager
def temp_repo():
    """Copy the whole repo into a temporary directory and yield a Repo on the copy (removed afterwards)."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "repo"
        shutil.copytree(ROOT, root, ignore=_ignore)
        yield Repo(root)


def _ignore(directory, names):
    """copytree filter: skip the heavy or private folders by name or by path from the repo root."""
    rel = Path(directory).relative_to(ROOT)
    return {n for n in names if n in SKIP_NAMES or (rel / n).as_posix() in SKIP_PATHS}


def _silence(text, role, out):
    """Write 0.1 s of 22050 Hz 16-bit mono silence to `out` and report fixed voice settings."""
    with wave.open(str(out), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(22050)
        wav.writeframes(b"\x00\x00" * 2205)
    return {"voice": "test", "rate": 150, "volume": 100}


@contextlib.contextmanager
def quiet_audio():
    """Replace tts.synthesize with the silent stub: never calls `say`."""
    with mock.patch("momo_agent.tts.synthesize", side_effect=_silence) as patched:
        yield patched
