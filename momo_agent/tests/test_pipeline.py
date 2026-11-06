import copy
import json
import unittest
from pathlib import Path

from momo_agent.llm import make_model
from momo_agent.pipeline import SceneIdConflict, generate_lesson
from momo_agent.repo import Repo

ROOT = Path(__file__).resolve().parents[2]


def birthday(scene_id=None):
    fx = json.loads((ROOT / "momo_agent/fixtures/birthday.json").read_text("utf-8"))
    fx = copy.deepcopy(fx)
    if scene_id:
        fx["planner"][-1]["scene_id"] = scene_id
    return fx


async def run(fx):
    # birthday is already in the repo as a generated sample, so it may be replaced
    return await generate_lesson("生日会", Repo(ROOT), lambda role: make_model(role, fx), overwrite=True)


class GenerateLessonTest(unittest.IsolatedAsyncioTestCase):
    async def test_birthday_pack(self):
        pack = await run(birthday())
        self.assertEqual(pack["status"], "draft")
        self.assertEqual(pack["generatedBy"], "momo_agent")
        self.assertEqual(len(pack["words"]), 4)
        self.assertEqual(len(pack["modules"]["story"]), 6)
        self.assertEqual(len(pack["modules"]["dialogue"]), 6)
        self.assertEqual(len(pack["modules"]["game"]["questions"]), 4)
        self.assertNotIn("collectionImage", pack["modules"]["game"])
        self.assertEqual(pack["interaction"]["gameAfterDialogue"], [2, 4, 5, 6])
        segments = pack["modules"]["story"][0]["segments"]
        self.assertEqual(segments[0]["speaker"], "narrator")
        ids = [a["id"] for a in pack["assets"]]
        self.assertEqual(len(ids), len(set(ids)))

    async def test_existing_scene_id(self):
        with self.assertRaises(SceneIdConflict):
            await run(birthday("park"))

    async def test_invalid_scene_id(self):
        with self.assertRaises(SceneIdConflict):
            await run(birthday("Birthday!"))


if __name__ == "__main__":
    unittest.main()
