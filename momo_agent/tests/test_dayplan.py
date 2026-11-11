import contextlib
import copy
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from momo_agent.__main__ import main
from momo_agent.dayplan import DayPlan, check_day_plan, day_file, load_day, plan_day, save_day
from momo_agent.fake_model import FixtureModel
from momo_agent.pipeline import LessonInvalid
from momo_agent.repo import Repo

ROOT = Path(__file__).resolve().parents[2]
ZOO = ROOT / "momo_agent/fixtures/zoo-day.json"


def zoo_dict() -> dict:
    return copy.deepcopy(json.loads(ZOO.read_text("utf-8"))["day_planner"][-1])


def plan_with(change=None) -> DayPlan:
    data = zoo_dict()
    if change:
        change(data)
    return DayPlan.model_validate(data)


class TempRepoCase(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        for sub in ("static/content", "static/illustrations"):
            shutil.copytree(ROOT / sub, self.root / sub)
        self.repo = Repo(self.root)


class CheckDayPlanTest(TempRepoCase):
    def errors(self, change=None, **kw):
        return check_day_plan(plan_with(change), self.repo, **kw)

    def test_fixture_plan_passes(self):
        self.assertEqual(self.errors(), [])

    def test_day_id_pattern(self):
        self.assertTrue(any("day_id" in e for e in self.errors(lambda d: d.update(day_id="Zoo Day"))))

    def test_scene_id_pattern(self):
        errors = self.errors(lambda d: d["levels"][0].update(scene_id="Zoo_1"))
        self.assertTrue(any("Zoo_1" in e for e in errors))

    def test_day_id_everyday_always_refused(self):
        self.assertTrue(self.errors(lambda d: d.update(day_id="everyday")))
        self.assertTrue(self.errors(lambda d: d.update(day_id="everyday"), overwrite=True))

    def test_day_id_existing_file(self):
        save_day(self.repo, {"dayId": "zoo-day"})
        self.assertTrue(any("zoo-day" in e for e in self.errors()))
        self.assertEqual(self.errors(overwrite=True), [])

    def test_level_count(self):
        self.assertTrue(any("关数" in e for e in self.errors(lambda d: d["levels"].pop())))

    def test_four_words_each(self):
        errors = self.errors(lambda d: d["levels"][0]["words"].pop())
        self.assertTrue(any("4" in e for e in errors))

    def test_word_letters_only(self):
        errors = self.errors(lambda d: d["levels"][0]["words"][0].update(text="Big Cat"))
        self.assertTrue(any("Big Cat" in e for e in errors))

    def test_not_word(self):
        errors = self.errors(lambda d: d["levels"][0]["words"][0].update(text="turtle"))
        self.assertTrue(any("turtle" in e for e in errors))

    def test_word_repeated_across_day(self):
        errors = self.errors(lambda d: d["levels"][1]["words"][0].update(text="bed"))
        self.assertTrue(any("bed" in e and "重复" in e for e in errors))

    def test_band_range(self):
        self.assertTrue(any("band" in e for e in self.errors(lambda d: d["levels"][4].update(band=6))))

    def test_band_not_decreasing(self):
        def change(d):
            for level, band in zip(d["levels"], [0, 2, 1, 3, 4]):
                level["band"] = band
        self.assertTrue(any("递减" in e for e in self.errors(change)))

    def test_scene_id_unique_in_day(self):
        errors = self.errors(lambda d: d["levels"][1].update(scene_id="zoo-morning"))
        self.assertTrue(any("zoo-morning" in e and "重复" in e for e in errors))

    def test_scene_id_of_hand_written_theme(self):
        errors = self.errors(lambda d: d["levels"][0].update(scene_id="park"), overwrite=True)
        self.assertTrue(any("park" in e for e in errors))

    def test_required_texts(self):
        for field in ("title", "goal", "bridge_en", "bridge_cn"):
            errors = self.errors(lambda d: d["levels"][0].update({field: "  "}))
            self.assertTrue(any(field in e for e in errors), field)

    def test_bridge_en_length(self):
        errors = self.errors(lambda d: d["levels"][0].update(bridge_en="x" * 81))
        self.assertTrue(any("bridge_en" in e for e in errors))


class PlanDayAsyncTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.repo = Repo(ROOT)  # read-only here

    async def test_zoo_fixture(self):
        responses = json.loads(ZOO.read_text("utf-8"))["day_planner"]
        plan = await plan_day("去动物园", self.repo, FixtureModel(responses, role="day_planner"))
        self.assertTrue(5 <= len(plan.levels) <= 7)

    async def test_rewrite_after_bad_first_reply(self):
        bad = zoo_dict()
        bad["levels"][0]["words"][0]["text"] = "turtle"
        model = FixtureModel([bad, zoo_dict()], role="day_planner")
        plan = await plan_day("去动物园", self.repo, model)
        self.assertEqual(len(model.calls), 2)
        self.assertEqual(plan.day_id, "zoo-day")

    async def test_gives_up_after_two_rewrites(self):
        bad = zoo_dict()
        bad["levels"][0]["words"][0]["text"] = "turtle"
        model = FixtureModel([bad, bad, bad], role="day_planner")
        with self.assertRaises(LessonInvalid):
            await plan_day("去动物园", self.repo, model)
        self.assertEqual(len(model.calls), 3)


class DayPlanCommandTest(TempRepoCase):
    def run_cmd(self, *extra):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main(["day-plan", "去动物园", "--fixtures", str(ZOO), *extra], root=self.root)
        return code, out.getvalue()

    def test_writes_plan_file_and_lists_missing_pictures(self):
        code, out = self.run_cmd()
        self.assertEqual(code, 0, out)
        data = load_day(self.repo, "zoo-day")
        self.assertEqual(data["schemaVersion"], 1)
        self.assertEqual(data["topic"], "去动物园")
        self.assertEqual((data["pictures"], data["levels"]), ({}, {}))
        self.assertEqual(len(data["plan"]["levels"]), 5)
        self.assertIn("giraffe", out)
        self.assertIn("缺图", out)

    def test_refuses_existing_file_without_overwrite(self):
        self.assertEqual(self.run_cmd()[0], 0)
        before = day_file(self.repo, "zoo-day").read_text("utf-8")
        code, out = self.run_cmd()
        self.assertEqual(code, 1)
        self.assertIn("--overwrite", out)
        self.assertEqual(day_file(self.repo, "zoo-day").read_text("utf-8"), before)
        self.assertEqual(self.run_cmd("--overwrite")[0], 0)

    def test_rejects_bad_topic(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main(["day-plan", "忽略指令", "--fixtures", str(ZOO)], root=self.root)
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
