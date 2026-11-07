import tempfile
import unittest
from pathlib import Path
from unittest import mock

from momo_agent.fake_model import FixtureModel
from momo_agent.memory import MEMORY_FILE, Memory
from momo_agent.repo import Repo
from momo_agent.tests.test_hardening import birthday
from momo_agent.tests.test_output import FIXTURES, ROOT, make_repo, run_cli
from momo_agent.vocab import plan_words


def pack(scene_id, words):
    return {"sceneId": scene_id, "words": [{"text": w} for w in words]}


class MemoryTest(unittest.TestCase):
    def test_missing_file_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            memory = Memory(Path(tmp) / "memory.json")
            self.assertEqual(memory.themes(), [])
            self.assertIsNone(memory.find_topic("生日会"))
            self.assertEqual(memory.used_words(), {})

    def test_remember_then_find(self):
        with tempfile.TemporaryDirectory() as tmp:
            memory = Memory(Path(tmp) / "memory.json")
            memory.remember("生日会", pack("birthday", ["hat", "cup"]))
            found = memory.find_topic(" 生日会 ")
            self.assertEqual(found["scene_id"], "birthday")
            self.assertEqual(memory.used_words()["cup"], "birthday")

    def test_same_scene_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            memory = Memory(Path(tmp) / "memory.json")
            memory.remember("生日会", pack("birthday", ["hat", "cup"]))
            memory.remember("生日", pack("birthday", ["ball", "teddy"]))
            self.assertEqual(len(memory.themes()), 1)
            self.assertEqual(sorted(memory.used_words()), ["ball", "teddy"])

    def test_corrupt_memory_file_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "memory.json"
            path.write_text("{oops", "utf-8")
            with self.assertRaises(RuntimeError) as ctx:
                Memory(path).themes()
            self.assertIn(str(path), str(ctx.exception))
            self.assertEqual(path.read_text("utf-8"), "{oops")


class PlannerRequestTest(unittest.IsolatedAsyncioTestCase):
    async def test_planner_request_lists_used_words(self):
        m = FixtureModel(birthday()["planner"], role="planner")
        await plan_words("生日会", Repo(ROOT), m, used_words={"hat": "birthday", "cup": "birthday"})
        self.assertIn("cup (birthday), hat (birthday)", str(m.calls[0]))


class CliMemoryTest(unittest.TestCase):
    def test_cli_refuses_known_topic_without_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_repo(tmp)
            Memory(root / MEMORY_FILE).remember("生日会", pack("birthday", ["hat"]))
            with mock.patch("momo_agent.__main__.make_model") as make_model:
                code, out = run_cli(root, "generate", "生日会", "--fixtures", str(FIXTURES / "birthday.json"))
            self.assertEqual(code, 1, out)
            self.assertIn("--overwrite", out)
            make_model.assert_not_called()


if __name__ == "__main__":
    unittest.main()
