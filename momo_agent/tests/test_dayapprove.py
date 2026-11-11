import contextlib
import io
import json
import unittest

from momo_agent import dayapprove, pictures, quiz
from momo_agent.__main__ import main
from momo_agent.dayplan import load_day, save_day
from momo_agent.tests.daykit import quiet_audio, temp_repo
from momo_agent.tests.test_dayrun import PICTURES, SCENES, build, day_entry, saved_day, set_word


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


if __name__ == "__main__":
    unittest.main()
