import asyncio
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from momo_agent.llm import make_model
from momo_agent.pipeline import generate_lesson
from momo_agent.register import register
from momo_agent.repo import Repo
from momo_agent.scenes import write_lesson
from momo_agent.tests.test_output import FIXTURES, ROOT, make_repo

PACKAGE = ROOT / "momo_agent"
SET_RELEASED = re.compile(r"""['"]status['"]\]?\s*[:=]\s*['"]released""")
TOUCH_CATALOG = re.compile(r"""(releasedScenes|requiredReleaseScenes)['"]\]\s*(=|\.append|\.extend)""")


class NeverReleasesTest(unittest.TestCase):
    def test_written_pack_is_draft_and_catalog_release_lists_untouched(self):
        fixtures = json.loads((FIXTURES / "birthday.json").read_text("utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            root = make_repo(tmp)
            repo = Repo(root)
            catalog_file = root / "static/content/catalog.json"
            before = json.loads(catalog_file.read_text("utf-8"))
            pack = asyncio.run(generate_lesson("生日会", repo, lambda role: make_model(role, fixtures), overwrite=True))
            with mock.patch("momo_agent.scenes.render_audio", return_value={}), \
                    mock.patch("momo_agent.scenes.validate_pack", return_value=[]):  # skip the slow speech synthesis
                write_lesson(pack, repo)
            register(repo)

            written = json.loads((root / "static/content/birthday.json").read_text("utf-8"))
            self.assertEqual(written["status"], "draft")
            after = json.loads(catalog_file.read_text("utf-8"))
            self.assertEqual(after["releasedScenes"], before["releasedScenes"])
            self.assertEqual(after["requiredReleaseScenes"], before["requiredReleaseScenes"])

    def test_source_never_assigns_release(self):
        for path in PACKAGE.rglob("*.py"):
            if "tests" in path.relative_to(PACKAGE).parts:
                continue
            text = path.read_text("utf-8")
            self.assertIsNone(SET_RELEASED.search(text), f"{path} sets status to released")
            self.assertIsNone(TOUCH_CATALOG.search(text), f"{path} edits a release list")


if __name__ == "__main__":
    unittest.main()
