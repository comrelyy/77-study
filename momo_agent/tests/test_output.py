import contextlib
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from momo_agent.__main__ import main
from momo_agent.register import register
from momo_agent.tests import daykit
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


def quiz_repo(tmp: str, *scenes: str) -> Path:
    """A throwaway repo with the files lesson-build needs; the real repo is never written."""
    root = make_repo(tmp)
    shutil.copy(ROOT / "lesson-build.cjs", root / "lesson-build.cjs")
    for helper in ("route-build.cjs", "route-bridges.cjs"):
        shutil.copy(ROOT / helper, root / helper)
    (root / "static/core").mkdir(parents=True)
    shutil.copy(ROOT / "static/core/model.js", root / "static/core/model.js")
    (root / "content-lesson").mkdir()
    for scene in scenes:
        src = ROOT / "content-lesson" / f"{scene}.json"
        if src.exists():
            shutil.copy(src, root / "content-lesson" / f"{scene}.json")
    audio = ROOT / "static/audio"
    (root / "static/audio").mkdir(exist_ok=True)
    # every theme voices its missing lesson audio into its manifest, so all manifests are needed
    for manifest in audio.glob("s4-*manifest.json"):
        shutil.copy(manifest, root / "static/audio" / manifest.name)
    return root


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


@mock.patch("momo_agent.tts.synthesize", new=daykit.silence)
class EndToEndTest(unittest.TestCase):
    def test_birthday_generate_and_register(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            before = json.loads((root / "static/content/catalog.json").read_text("utf-8"))
            code, out = run_cli(root, "generate", "生日会", "--fixtures", str(FIXTURES / "birthday.json"), "--overwrite")
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
