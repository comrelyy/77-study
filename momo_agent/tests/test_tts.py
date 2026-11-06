import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from momo_agent import tts

ROOT = Path(__file__).resolve().parents[2]


def inspect_wav(path: Path) -> dict:
    script = "const {inspectWav}=require('./audio-validation.cjs');" \
             "console.log(JSON.stringify(inspectWav(require('fs').readFileSync(process.argv[1]))))"
    out = subprocess.run(["node", "-e", script, str(path)], cwd=ROOT,
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


@unittest.skipUnless(sys.platform == "darwin", "macOS say only")
class MacSynthesizeTest(unittest.TestCase):
    def test_wav_passes_inspect_wav(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "t.wav"
            info = tts.synthesize("tree", "momo", out)
            inspect_wav(out)
            self.assertEqual(info, {"voice": "Samantha (macOS say)", "rate": 150, "volume": 100})

    def test_text_starting_with_dash_is_not_an_option(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "t.wav"
            tts.synthesize("-v Alex hello", "momo", out)
            inspect_wav(out)
            self.assertGreater(out.stat().st_size, 20000)

    def test_shell_text_is_inert(self):
        with tempfile.TemporaryDirectory() as tmp:
            marker = Path(tmp) / "pwned"
            out = Path(tmp) / "t.wav"
            tts.synthesize(f"hi; touch {marker}; rm -rf ~", "fox", out)
            inspect_wav(out)
            self.assertFalse(marker.exists())


class WindowsSynthesizeTest(unittest.TestCase):
    def test_text_goes_through_env_not_command(self):
        text = '"; rm -rf ~ $(x)'
        with mock.patch.object(tts.sys, "platform", "win32"), \
                mock.patch.object(tts.subprocess, "run") as run:
            info = tts.synthesize(text, "turtle", Path("out.wav"))
        args, kwargs = run.call_args
        cmd = args[0]
        self.assertEqual(cmd[:3], ["powershell", "-NoProfile", "-Command"])
        self.assertNotIn(text, " ".join(cmd))
        self.assertEqual(kwargs["env"]["MOMO_TTS_TEXT"], text)
        self.assertEqual(kwargs["env"]["MOMO_TTS_RATE"], "-3")
        self.assertEqual(kwargs["env"]["MOMO_TTS_OUT"], str(Path("out.wav").resolve()))
        self.assertIn("SAPI.SpVoice", cmd[3])
        self.assertIn("SAPI.SpFileStream", cmd[3])
        self.assertIn("Microsoft Zira Desktop - English (United States)", cmd[3])
        self.assertEqual(info, {"voice": "Microsoft Zira Desktop - English (United States)",
                                "rate": -3, "volume": 90})

    def test_other_platform_raises(self):
        with mock.patch.object(tts.sys, "platform", "linux"):
            with self.assertRaises(RuntimeError):
                tts.synthesize("tree", "momo", Path("out.wav"))


class RenderAudioTest(unittest.TestCase):
    def test_writes_wavs_and_manifest(self):
        pack = {"sceneId": "park", "contentVersion": "0.1.0", "assets": [
            {"id": "park.tree.audio", "kind": "audio", "path": "audio/park/v0-1-0/park.tree.audio.wav",
             "text": "tree", "role": "momo", "language": "en-US"},
            {"id": "park.tree.image", "kind": "image", "path": "illustrations/tree.svg"},
        ]}

        def fake(text, role, out):
            Path(out).write_bytes(b"RIFFfake")
            return {"voice": "V", "rate": 1, "volume": 2}

        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(tts, "synthesize", fake):
            root = Path(tmp)
            manifest = tts.render_audio(pack, root)
            self.assertEqual(sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()),
                             ["audio/park/v0-1-0/park.tree.audio.wav", "audio/s4-park-manifest.json"])
            self.assertEqual(json.loads((root / "audio/s4-park-manifest.json").read_text()), manifest)
        self.assertEqual(manifest["sceneId"], "park")
        self.assertEqual(manifest["rightsStatus"], "pending review")
        self.assertIs(manifest["reviewed"], False)
        self.assertEqual(len(manifest["entries"]), 1)
        e = manifest["entries"][0]
        self.assertEqual(e["sha256"], hashlib.sha256(b"RIFFfake").hexdigest())
        self.assertEqual((e["voice"], e["rate"], e["volume"]), ("V", 1, 2))


if __name__ == "__main__":
    unittest.main()
