import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from momo_agent.__main__ import main
from momo_agent.register import register
from momo_agent.repo import Repo
from momo_agent.scenes import render_scene
from momo_agent.validate import validate_pack

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "momo_agent/fixtures"


def make_repo(tmp: str) -> Path:
    """A throwaway copy of the parts of static/ the lesson reads; nothing is written to the real one."""
    static = Path(tmp) / "static"
    for sub in ("content", "illustrations"):
        shutil.copytree(ROOT / "static" / sub, static / sub)
    return Path(tmp)


def run_cli(root: Path, *argv: str) -> tuple[int, str]:
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = main(list(argv), root=root)
    return code, out.getvalue()


class RenderSceneTest(unittest.TestCase):
    def test_frame_and_hotspot(self):
        svg, hotspot = render_scene("hat", Repo(ROOT))
        self.assertIn('viewBox="0 0 600 280"', svg)
        self.assertIn('<rect x="2" y="2" width="596" height="276" rx="24" fill="#fffaf0"/>', svg)
        self.assertIn('x="120" y="170" width="80" height="80"', svg)
        self.assertEqual(hotspot, {"x": 160 / 600, "y": 210 / 280})


@unittest.skipUnless(sys.platform == "darwin", "macOS say only")
class EndToEndTest(unittest.TestCase):
    def setUp(self):
        # a real provider exported in the shell must never make paid calls from tests
        patcher = mock.patch.dict(os.environ, {"MOMO_LLM_PROVIDER": "fake"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_birthday_generate_and_register(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_repo(tmp)
            before = json.loads((root / "static/content/catalog.json").read_text("utf-8"))
            code, out = run_cli(root, "generate", "生日会", "--fixtures", str(FIXTURES / "birthday.json"))
            self.assertEqual(code, 0, out)

            static = root / "static"
            pack = json.loads((static / "content/birthday.json").read_text("utf-8"))
            manifest = json.loads((static / "audio/s4-birthday-manifest.json").read_text("utf-8"))
            self.assertEqual(validate_pack(pack, static, manifest, assume_scene_images=False), [])
            self.assertEqual(pack["status"], "draft")
            self.assertTrue(all(s["hotspots"][0]["word"] == s["mainWord"] for s in pack["modules"]["story"]))

            for _ in range(2):
                register(Repo(root))
            catalog = json.loads((static / "content/catalog.json").read_text("utf-8"))
            self.assertEqual(catalog["previewScenes"].count("birthday"), 1)
            # the repo already ships the birthday sample, so the other themes are what must stay put
            others = [scene for scene in before["previewScenes"] if scene != "birthday"]
            self.assertEqual([s for s in catalog["previewScenes"] if s != "birthday"], others)
            self.assertEqual(catalog["releasedScenes"], [])
            self.assertEqual(catalog["requiredReleaseScenes"], before["requiredReleaseScenes"])

    def test_ocean_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_repo(tmp)
            code, out = run_cli(root, "generate", "海洋", "--fixtures", str(FIXTURES / "ocean.json"))
            self.assertEqual(code, 2)
            self.assertIn("fish", out)
            self.assertFalse((root / "static/content/ocean.json").exists())


if __name__ == "__main__":
    unittest.main()
