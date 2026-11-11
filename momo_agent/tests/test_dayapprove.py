import contextlib
import io
import json
import unittest

from momo_agent import dayapprove, pictures, quiz
from momo_agent.__main__ import main
from momo_agent.dayplan import load_day, save_day
from momo_agent.tests.daykit import ROOT, quiet_audio, temp_repo
from momo_agent.tests.test_dayrun import PICTURES, SCENES, WORDS, ZOO, build, catalog, day_entry, day_fixtures, saved_day, set_word


def built(repo, drawings=1):
    """The zoo day with one word that needs a drawing (kite), generated and registered, not approved."""
    saved_day(repo)
    set_word(repo, 0, 0, "kite")
    build(repo, drawings)


def approve_everything(repo):
    day = load_day(repo, "zoo-day")
    for word in day["pictures"]:
        pictures.approve_picture(day, word, repo)
    save_day(repo, day)
    with quiet_audio(), contextlib.redirect_stdout(io.StringIO()):
        for sid in SCENES:
            quiz.approve(sid, repo)


def run(repo, *argv):
    out = io.StringIO()
    with quiet_audio(), contextlib.redirect_stdout(out):
        code = main(list(argv), root=repo.root)
    return code, out.getvalue()


class DayApproveTest(unittest.TestCase):
    def test_everyday_has_no_gate(self):
        with temp_repo() as repo:
            with self.assertRaisesRegex(RuntimeError, "第 1 天不走这个闸门"):
                dayapprove.approve_day(repo, "everyday")

    def test_half_built_day_cannot_be_approved(self):
        with temp_repo() as repo:
            saved_day(repo)
            problems = dayapprove.approval_problems(repo, "zoo-day")
            self.assertEqual(len(problems), len(SCENES))
            with self.assertRaises(RuntimeError):
                dayapprove.approve_day(repo, "zoo-day")
            code, text = run(repo, "day-approve", "zoo-day")
            self.assertEqual(code, 1)
            self.assertIn(SCENES[0], text)

    def test_gate_names_every_open_problem_then_opens(self):
        with temp_repo() as repo:
            built(repo)
            problems = "\n".join(dayapprove.approval_problems(repo, "zoo-day"))
            self.assertIn("kite", problems)
            for sid in SCENES:
                self.assertIn(sid, problems)  # lesson.reviewed is still false
            approve_everything(repo)
            self.assertEqual(dayapprove.approval_problems(repo, "zoo-day"), [])
            code, text = run(repo, "day-approve", "zoo-day")
            self.assertEqual(code, 0, text)
            self.assertIs(day_entry(repo)["approved"], True)
            snapshot = json.loads((repo.root / "static/dev/days/zoo-day.json").read_text("utf-8"))
            self.assertIs(snapshot["approved"], True)
            self.assertEqual(snapshot["pictures"]["kite"], {"status": "approved", "path": "illustrations/kite.svg"})

    def test_changed_picture_after_approval_is_a_problem(self):
        with temp_repo() as repo:
            built(repo)
            approve_everything(repo)
            (repo.root / "static/illustrations/kite.svg").write_text("<svg/>", "utf-8")
            problems = dayapprove.approval_problems(repo, "zoo-day")
            self.assertEqual(len(problems), 1)
            self.assertIn("sha", problems[0])

    def test_unreviewed_level_names_the_level(self):
        with temp_repo() as repo:
            built(repo)
            approve_everything(repo)
            overlay = quiz.overlay_path(SCENES[2], repo)
            data = json.loads(overlay.read_text("utf-8"))
            data["reviewed"] = False
            overlay.write_text(json.dumps(data), "utf-8")
            with quiet_audio(), contextlib.redirect_stdout(io.StringIO()):
                quiz.run_lesson_build(SCENES[2], repo)
            problems = dayapprove.approval_problems(repo, "zoo-day")
            self.assertEqual(len(problems), 1)
            self.assertIn(SCENES[2], problems[0])

    def test_regeneration_takes_the_approval_back(self):
        with temp_repo() as repo:
            built(repo)
            approve_everything(repo)
            dayapprove.approve_day(repo, "zoo-day")
            fixtures = repo.root / "redraw.json"
            fixtures.write_text(json.dumps({"illustrator": PICTURES[1:2]}), "utf-8")
            code, text = run(repo, "day-redraw", "zoo-day", "kite", "--fixtures", str(fixtures))
            self.assertEqual(code, 0, text)
            self.assertIs(day_entry(repo)["approved"], False)
            snapshot = json.loads((repo.root / "static/dev/days/zoo-day.json").read_text("utf-8"))
            self.assertIs(snapshot["approved"], False)
            self.assertEqual(snapshot["pictures"]["kite"]["status"], "pending")
            # approve again, then a build also takes it back
            day = load_day(repo, "zoo-day")
            pictures.approve_picture(day, "kite", repo)
            save_day(repo, day)
            dayapprove.approve_day(repo, "zoo-day")
            self.assertIs(day_entry(repo)["approved"], True)
            build(repo)
            self.assertIs(day_entry(repo)["approved"], False)

    def test_picture_approve_command_refreshes_the_snapshot(self):
        with temp_repo() as repo:
            built(repo)
            snap = repo.root / "static/dev/days/zoo-day.json"
            self.assertEqual(json.loads(snap.read_text("utf-8"))["pictures"]["kite"]["status"], "pending")
            code, text = run(repo, "day-picture-approve", "zoo-day", "kite")
            self.assertEqual(code, 0, text)
            self.assertEqual(json.loads(snap.read_text("utf-8"))["pictures"]["kite"]["status"], "approved")

    def test_snapshot_lists_levels_in_plan_order(self):
        with temp_repo() as repo:
            built(repo)
            snapshot = json.loads((repo.root / "static/dev/days/zoo-day.json").read_text("utf-8"))
            self.assertEqual([lv["sceneId"] for lv in snapshot["levels"]], SCENES)
            self.assertEqual(snapshot["dayId"], "zoo-day")
            first = snapshot["levels"][0]
            self.assertEqual(set(first), {"sceneId", "title", "band", "words", "bridge"})
            self.assertEqual(first["words"][0], "kite")
            self.assertEqual(set(first["bridge"]), {"text", "cn"})

    def approved_day(self, repo):
        built(repo)
        approve_everything(repo)
        dayapprove.approve_day(repo, "zoo-day")
        self.assertIs(day_entry(repo)["approved"], True)

    def test_missing_pack_file_is_one_problem(self):
        with temp_repo() as repo:
            built(repo)
            approve_everything(repo)
            (repo.root / f"static/content/{SCENES[1]}.json").unlink()
            problems = dayapprove.approval_problems(repo, "zoo-day")
            self.assertEqual(len(problems), 1)
            self.assertIn(SCENES[1], problems[0])
            self.assertIn("内容包不存在", problems[0])

    def test_edited_plan_is_one_problem(self):
        with temp_repo() as repo:
            built(repo)
            approve_everything(repo)
            day = load_day(repo, "zoo-day")
            day["plan"]["levels"][3]["title"] = "改过的标题"
            save_day(repo, day)
            problems = dayapprove.approval_problems(repo, "zoo-day")
            self.assertEqual(len(problems), 1)
            self.assertIn(SCENES[3], problems[0])
            self.assertIn("和现在的计划不一致", problems[0])

    def test_level_missing_from_catalog_route_is_one_problem(self):
        with temp_repo() as repo:
            built(repo)
            approve_everything(repo)
            path = repo.root / "static/content/catalog.json"
            data = catalog(repo)
            day = next(d for d in data["days"] if d["id"] == "zoo-day")
            day["route"] = [r for r in day["route"] if r["id"] != SCENES[2]]
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")
            problems = dayapprove.approval_problems(repo, "zoo-day")
            self.assertEqual(len(problems), 1)
            self.assertIn(SCENES[2], problems[0])
            self.assertIn("还没有生成进目录", problems[0])

    def test_new_plan_takes_the_approval_back(self):
        with temp_repo() as repo:
            self.approved_day(repo)
            fixtures = ROOT / "momo_agent/fixtures/zoo-day.json"
            code, text = run(repo, "day-plan", "去动物园", "--fixtures", str(fixtures), "--overwrite")
            self.assertEqual(code, 0, text)
            self.assertIs(day_entry(repo)["approved"], False)
            snapshot = json.loads((repo.root / "static/dev/days/zoo-day.json").read_text("utf-8"))
            self.assertIs(snapshot["approved"], False)
            self.assertEqual(snapshot["pictures"]["kite"]["status"], "approved")  # review records stay with the day

    def test_replanning_keeps_the_review_records(self):
        with temp_repo() as repo:
            built(repo)  # kite drawn, still pending
            day = load_day(repo, "zoo-day")
            day["droppedLevels"] = ["zoo-old"]
            save_day(repo, day)
            plan = json.loads(json.dumps(day["plan"]))
            plan["levels"][2]["words"][0]["text"] = WORDS[20]  # one level changes
            fixtures = repo.root / "replan.json"
            fixtures.write_text(json.dumps({"day_planner": [plan]}), "utf-8")
            code, text = run(repo, "day-plan", "去动物园", "--fixtures", str(fixtures), "--overwrite")
            self.assertEqual(code, 0, text)
            day = load_day(repo, "zoo-day")
            self.assertEqual(day["plan"], plan)
            self.assertEqual(day["pictures"]["kite"]["status"], "pending")
            self.assertEqual(day["droppedLevels"], ["zoo-old"])
            self.assertEqual(build(repo)["regenerated"], [SCENES[2]])
            self.assertTrue(any("kite" in p for p in dayapprove.approval_problems(repo, "zoo-day")))


    def test_new_quiz_of_a_day_level_takes_the_approval_back(self):
        with temp_repo() as repo:
            self.approved_day(repo)
            fixtures = repo.root / "quiz-fixtures.json"
            fixtures.write_text(json.dumps(day_fixtures(load_day(repo, "zoo-day"))[SCENES[1]]), "utf-8")
            code, text = run(repo, "quiz", SCENES[1], "--fixtures", str(fixtures))
            self.assertEqual(code, 0, text)
            self.assertIs(day_entry(repo)["approved"], False)
            snapshot = json.loads((repo.root / "static/dev/days/zoo-day.json").read_text("utf-8"))
            self.assertIs(snapshot["approved"], False)

    def test_quiz_of_an_everyday_level_leaves_everyday_approved(self):
        with temp_repo() as repo:
            run(repo, "quiz", "picnic", "--fixtures", str(ROOT / "momo_agent/fixtures/birthday.json"))
            self.assertIs(next(d for d in catalog(repo)["days"] if d["id"] == "everyday")["approved"], True)

    def test_generate_refuses_a_level_of_a_generated_day(self):
        with temp_repo() as repo:
            self.approved_day(repo)
            fx = json.loads((ROOT / "momo_agent/fixtures/birthday.json").read_text("utf-8"))
            fx["planner"][-1]["scene_id"] = SCENES[1]
            fixtures = repo.root / "generate.json"
            fixtures.write_text(json.dumps(fx), "utf-8")
            pack_file = repo.root / f"static/content/{SCENES[1]}.json"
            before = pack_file.read_bytes()
            code, text = run(repo, "generate", "生日会", "--fixtures", str(fixtures), "--overwrite")
            self.assertEqual(code, 1, text)
            self.assertIn("day-build zoo-day", text)
            self.assertEqual(pack_file.read_bytes(), before)
            self.assertIs(day_entry(repo)["approved"], True)

    def test_draw_command_refreshes_the_snapshot(self):
        with temp_repo() as repo:
            saved_day(repo)
            set_word(repo, 0, 0, "kite")
            fixtures = repo.root / "draw.json"
            fixtures.write_text(json.dumps({"illustrator": PICTURES[1:2]}), "utf-8")
            code, text = run(repo, "day-draw", "zoo-day", "--fixtures", str(fixtures))
            self.assertEqual(code, 0, text)
            snapshot = json.loads((repo.root / "static/dev/days/zoo-day.json").read_text("utf-8"))
            self.assertEqual(snapshot["pictures"]["kite"]["status"], "pending")


if __name__ == "__main__":
    unittest.main()
