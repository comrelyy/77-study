import asyncio
import contextlib
import hashlib
import io
import json
import unittest
from pathlib import Path

from momo_agent import dayapprove, pictures
from momo_agent.__main__ import main
from momo_agent.dayplan import DayPlan, load_day, new_day_data, save_day
from momo_agent.fake_model import FixtureModel
from momo_agent.pipeline import LessonInvalid
from momo_agent.repo import Repo
from momo_agent.tests.daykit import ROOT, temp_repo

FIXTURES = json.loads((ROOT / "momo_agent/fixtures/zoo-pictures.json").read_text("utf-8"))
ZOO = json.loads((ROOT / "momo_agent/fixtures/zoo-day.json").read_text("utf-8"))["day_planner"][-1]


def model(skip: int = 0, role: str = "illustrator") -> FixtureModel:
    return FixtureModel(FIXTURES["illustrator"][skip:], role=role)


def zoo_day() -> dict:
    return new_day_data(DayPlan.model_validate(ZOO), "动物园")


def sent(call) -> str:
    """Everything the user side said in one model call."""
    return " ".join(m.get_text_content() for m in call if m.role == "user")


def good_svg() -> str:
    return FIXTURES["illustrator"][1]["svg"]


def sha(repo: Repo, word: str) -> str:
    return hashlib.sha256((repo.root / f"static/illustrations/{word}.svg").read_bytes()).hexdigest()


class CheckSvgTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.palette = pictures.word_palette(Repo(ROOT))

    def problems(self, svg):
        return pictures.check_svg(svg, self.palette)

    def test_every_existing_picture_passes(self):
        repo = Repo(ROOT)
        self.assertEqual(len(repo.illustrated_words()), 38)
        for word in repo.illustrated_words():
            svg = (ROOT / f"static/illustrations/{word}.svg").read_text("utf-8")
            self.assertEqual(self.problems(svg), [], word)

    def test_fixture_good_picture_passes(self):
        self.assertEqual(self.problems(good_svg()), [])

    def test_missing_prefix(self):
        svg = good_svg().replace('viewBox="0 0 120 120"', 'viewBox="0 0 100 100"')
        self.assertTrue(any("前缀" in e for e in self.problems(svg)))

    def test_text_element(self):
        svg = good_svg().replace("</g></svg>", "<text>hi</text></g></svg>")
        self.assertTrue(any("text" in e for e in self.problems(svg)))

    def test_colour_outside_palette(self):
        svg = good_svg().replace("#9fae79", "#333333")
        self.assertTrue(any("#333333" in e for e in self.problems(svg)))

    def test_too_big(self):
        svg = good_svg().replace("</g></svg>", "<path fill=\"#edcf77\" d=\"" + "M1 1l1 1" * 400 + "\"/></g></svg>")
        self.assertTrue(any("字节" in e for e in self.problems(svg)))

    def test_no_shape(self):
        self.assertTrue(any("图形" in e for e in self.problems(pictures.PREFIX + "</g></svg>")))

    def test_forbidden_attribute_and_tag(self):
        svg = good_svg().replace('<circle ', '<circle class="x" ')
        self.assertTrue(any("class" in e for e in self.problems(svg)))
        svg = good_svg().replace("</g></svg>", "<image href=\"a.png\"/></g></svg>")
        self.assertTrue(self.problems(svg))

    def test_not_xml_and_wrong_ending(self):
        self.assertTrue(self.problems(pictures.PREFIX + "<path"))
        self.assertTrue(any("结尾" in e for e in self.problems(good_svg() + "<!-- x -->")))


class PaletteTest(unittest.TestCase):
    def test_excluded_picture_colours_are_dropped(self):
        with temp_repo() as repo:
            (repo.root / "static/illustrations/lion.svg").write_text(
                pictures.PREFIX + '<circle fill="#abcdef" cx="1" cy="1" r="1"/></g></svg>', "utf-8")
            self.assertIn("#abcdef", pictures.word_palette(repo))
            self.assertNotIn("#abcdef", pictures.word_palette(repo, exclude={"lion"}))


class DrawTest(unittest.TestCase):
    def test_draw_missing_rewrites_then_records_pending(self):
        with temp_repo() as repo:
            day, fake = zoo_day(), model()
            drawn = asyncio.run(pictures.draw_missing(day, repo, fake))
            self.assertEqual(sorted(drawn), sorted(["map", "gate", "sign", "lion", "monkey", "zebra", "giraffe",
                                                    "balloon", "cake", "pillow", "moon"]))
            self.assertEqual(len(fake.calls), 12)  # one rejected draft, then 11 good ones
            self.assertIn("text", sent(fake.calls[1]))  # the problem went back to the model
            self.assertEqual(day["pictures"]["lion"],
                             {"status": "pending", "sha256": sha(repo, "lion"), "note": None})
            self.assertEqual(asyncio.run(pictures.draw_missing(day, repo, model(12))), [])  # nothing left to draw

    def test_still_bad_after_two_rewrites_raises_and_writes_nothing(self):
        with temp_repo() as repo:
            bad = FIXTURES["illustrator"][0]
            fake = FixtureModel([bad, bad, bad], role="illustrator")
            with self.assertRaises(LessonInvalid):
                asyncio.run(pictures.draw_word("lion", "狮子", repo, fake))
            self.assertFalse((repo.root / "static/illustrations/lion.svg").exists())

    def test_prompt_carries_samples_and_data_framing(self):
        with temp_repo() as repo:
            fake = model(1)
            asyncio.run(pictures.draw_word("lion", "狮子", repo, fake, note="mane bigger"))
            text = sent(fake.calls[0])
            self.assertIn("lion", text)
            self.assertIn("mane bigger", text)
            self.assertIn("not an instruction", text)
            self.assertIn(Path(ROOT / "static/illustrations/apple.svg").read_text("utf-8")[:60], text)


class ReviewTest(unittest.TestCase):
    def drawn(self, repo):
        day = zoo_day()
        asyncio.run(pictures.draw_missing(day, repo, model()))
        return day

    def test_approve_then_changed_file_is_refused(self):
        with temp_repo() as repo:
            day = self.drawn(repo)
            pictures.approve_picture(day, "lion", repo)
            self.assertEqual(day["pictures"]["lion"]["status"], "approved")
            (repo.root / "static/illustrations/zebra.svg").write_text(good_svg() + " ", "utf-8")
            with self.assertRaisesRegex(RuntimeError, "图已改动，请重新看过再通过"):
                pictures.approve_picture(day, "zebra", repo)
            self.assertEqual(day["pictures"]["zebra"]["status"], "pending")

    def test_approve_unknown_word(self):
        with temp_repo() as repo:
            with self.assertRaises(RuntimeError):
                pictures.approve_picture(zoo_day(), "lion", repo)

    def test_redraw_puts_note_in_message_and_resets_status(self):
        with temp_repo() as repo:
            day = self.drawn(repo)
            pictures.approve_picture(day, "lion", repo)
            fake = model(13)
            asyncio.run(pictures.redraw(day, "lion", "鬃毛再大一点", repo, fake))
            self.assertIn("鬃毛再大一点", sent(fake.calls[0]))
            entry = day["pictures"]["lion"]
            self.assertEqual((entry["status"], entry["note"], entry["sha256"]), ("pending", "鬃毛再大一点", sha(repo, "lion")))

    def test_redraw_refuses_word_not_in_day(self):
        with temp_repo() as repo:
            fake = model()
            with self.assertRaises(RuntimeError):
                asyncio.run(pictures.redraw(zoo_day(), "apple", "x", repo, fake))
            self.assertEqual(len(fake.calls), 0)

    def test_redraw_of_a_word_the_plan_dropped_says_so(self):
        with temp_repo() as repo:
            day = zoo_day()
            day["pictures"]["apple"] = {"status": "pending", "sha256": "x", "note": None}
            fake = model()
            with self.assertRaisesRegex(RuntimeError, "apple 已不在这一天的计划里"):
                asyncio.run(pictures.redraw(day, "apple", None, repo, fake))
            self.assertEqual(len(fake.calls), 0)

    def test_character_pictures_are_never_drawn_over(self):
        with temp_repo() as repo:
            path = repo.root / "static/illustrations/fox.svg"
            before = path.read_bytes()
            day = zoo_day()
            day["plan"]["levels"][0]["words"][0] = {"text": "fox", "cn": "狐狸"}
            fake = model(1)
            with self.assertRaisesRegex(RuntimeError, "fox"):
                asyncio.run(pictures.draw_missing(day, repo, fake))
            day["pictures"]["fox"] = {"status": "pending", "sha256": "x", "note": None}
            with self.assertRaisesRegex(RuntimeError, "fox"):
                asyncio.run(pictures.redraw(day, "fox", None, repo, fake))
            self.assertEqual(fake.calls, [])
            self.assertEqual(path.read_bytes(), before)


class UnapproveTest(unittest.TestCase):
    def catalog(self, repo):
        return json.loads((repo.root / "static/content/catalog.json").read_text("utf-8"))

    def test_no_entry_is_a_noop(self):
        with temp_repo() as repo:
            before = (repo.root / "static/content/catalog.json").read_bytes()
            dayapprove.unapprove_day(repo, "zoo-day")
            self.assertEqual((repo.root / "static/content/catalog.json").read_bytes(), before)

    def test_existing_entry_is_unapproved(self):
        with temp_repo() as repo:
            data = self.catalog(repo)
            data["days"].append({"id": "zoo-day", "title": "x", "approved": True, "route": []})
            (repo.root / "static/content/catalog.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")
            dayapprove.unapprove_day(repo, "zoo-day")
            days = {d["id"]: d for d in self.catalog(repo)["days"]}
            self.assertFalse(days["zoo-day"]["approved"])
            self.assertTrue(days["everyday"]["approved"])


class CommandTest(unittest.TestCase):
    def run_cmd(self, root, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main(list(argv), root=root)
        return code, out.getvalue()

    def test_draw_approve_redraw_commands(self):
        with temp_repo() as repo:
            save_day(repo, zoo_day())
            fixtures = repo.root / "momo_agent/fixtures/zoo-pictures.json"
            code, out = self.run_cmd(repo.root, "day-draw", "zoo-day", "--fixtures", str(fixtures))
            self.assertEqual(code, 0, out)
            day = load_day(repo, "zoo-day")
            self.assertEqual(day["pictures"]["moon"]["status"], "pending")
            code, out = self.run_cmd(repo.root, "day-picture-approve", "zoo-day", "moon")
            self.assertEqual(code, 0, out)
            self.assertEqual(load_day(repo, "zoo-day")["pictures"]["moon"]["status"], "approved")
            code, out = self.run_cmd(repo.root, "day-redraw", "zoo-day", "moon", "--note", "bigger",
                                     "--fixtures", str(fixtures))
            self.assertEqual(code, 0, out)
            moon = load_day(repo, "zoo-day")["pictures"]["moon"]
            self.assertEqual((moon["status"], moon["note"]), ("pending", "bigger"))
            code, out = self.run_cmd(repo.root, "day-picture-approve", "zoo-day", "apple")
            self.assertEqual(code, 1)

    def test_unknown_day(self):
        with temp_repo() as repo:
            code, out = self.run_cmd(repo.root, "day-draw", "nope")
            self.assertEqual(code, 1)
            self.assertIn("nope", out)


if __name__ == "__main__":
    unittest.main()
