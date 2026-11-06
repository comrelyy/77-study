import json
import unittest
from pathlib import Path

from momo_agent.llm import make_model
from momo_agent.repo import Repo
from momo_agent.vocab import LessonRefused, WordCard, WordPlan, check_words, plan_words

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "momo_agent/fixtures"


def fixtures(theme):
    return json.loads((FIXTURES / f"{theme}.json").read_text("utf-8"))


class CheckWordsTest(unittest.TestCase):
    def test_splits_by_illustration(self):
        words = [WordCard(text=t, cn="x") for t in [" Hat", "cup", "Balls", "fish"]]
        plan = WordPlan(scene_id="s", title="t", goal="g", function="f", words=words)
        have, missing = check_words(plan, ["hat", "cup", "ball"])
        self.assertEqual([c.text for c in have], ["hat", "cup"])
        self.assertEqual(missing, ["balls", "fish"])

    def test_duplicates_count_once(self):
        words = [WordCard(text=t, cn="x") for t in [" Hat", "hat", "cup", "Balls", "fish"]]
        plan = WordPlan(scene_id="s", title="t", goal="g", function="f", words=words)
        have, missing = check_words(plan, ["hat", "cup", "ball"])
        self.assertEqual([c.text for c in have], ["hat", "cup"])
        self.assertEqual(missing, ["balls", "fish"])


class PlanWordsTest(unittest.IsolatedAsyncioTestCase):
    async def test_birthday_gives_four_illustrated_words(self):
        fx = fixtures("birthday")
        plan = await plan_words("生日会", Repo(ROOT), make_model("planner", fx))
        self.assertEqual(len(plan.words), 4)
        self.assertEqual([c.text for c in plan.words], ["hat", "cup", "ball", "teddy"])

    async def test_ocean_is_refused(self):
        fx = fixtures("ocean")
        with self.assertRaises(LessonRefused) as ctx:
            await plan_words("海边", Repo(ROOT), make_model("planner", fx))
        self.assertEqual(ctx.exception.missing, ["fish", "boat", "shell"])
        self.assertEqual(ctx.exception.found, ["sun"])
