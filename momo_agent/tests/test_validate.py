import copy
import json
import unittest
from pathlib import Path

from momo_agent.llm import make_model
from momo_agent.pipeline import LessonInvalid, generate_lesson
from momo_agent.repo import Repo
from momo_agent.validate import validate_pack

ROOT = Path(__file__).resolve().parents[2]
STATIC = ROOT / "static"


def park():
    return json.loads((STATIC / "content/park.json").read_text("utf-8"))


class ValidatePackTest(unittest.TestCase):
    def test_park_is_valid(self):
        self.assertEqual(validate_pack(park(), STATIC), [])

    def test_park_with_audit(self):
        manifest = json.loads((STATIC / "audio/s4-park-manifest.json").read_text("utf-8"))
        # Review cards borrow other scenes' audio, so match against every scene's manifest (as content-audit does).
        for other in sorted((STATIC / "audio").glob("s4*-manifest.json")):
            if other.name != "s4-park-manifest.json":
                manifest["entries"] += json.loads(other.read_text("utf-8"))["entries"]
        self.assertEqual(validate_pack(park(), STATIC, manifest), [])

    def test_bad_image_reference(self):
        pack = park()
        pack["words"][0]["image"] = "no-such-image"
        self.assertTrue(any("invalid image reference" in e for e in validate_pack(pack, STATIC)))


class RepairLoopTest(unittest.IsolatedAsyncioTestCase):
    def fixtures(self, story):
        fx = copy.deepcopy(json.loads((ROOT / "momo_agent/fixtures/birthday.json").read_text("utf-8")))
        fx["story"] = story
        return fx

    async def run_lesson(self, fx):
        models = {}

        def model_for(role):
            models[role] = make_model(role, fx)
            return models[role]

        try:
            return await generate_lesson("生日会", Repo(ROOT), model_for, overwrite=True), models
        except LessonInvalid as err:
            err.models = models
            raise

    def stories(self):
        good = json.loads((ROOT / "momo_agent/fixtures/birthday.json").read_text("utf-8"))["story"][0]
        bad = copy.deepcopy(good)
        for scene in bad["scenes"]:
            for key in ("narration", "momo_line", "bunny_line"):
                scene[key] = scene[key].replace("teddy", "bear")
        return good, bad

    async def test_story_retry(self):
        good, bad = self.stories()
        pack, models = await self.run_lesson(self.fixtures([bad, good]))
        self.assertEqual(pack["status"], "draft")
        calls = models["story"].calls
        self.assertEqual(len(calls), 2)
        self.assertIn("target word missing: teddy", str(calls[1]))

    async def test_story_gives_up(self):
        _, bad = self.stories()
        with self.assertRaises(LessonInvalid) as ctx:
            await self.run_lesson(self.fixtures([bad, bad, bad]))
        self.assertEqual(len(ctx.exception.models["story"].calls), 3)
        self.assertIn("target word missing: teddy", ctx.exception.errors)


if __name__ == "__main__":
    unittest.main()
