import asyncio
import contextlib
import io
import json
import re
import unittest
from unittest import mock

from momo_agent import pictures
from momo_agent.__main__ import main
from momo_agent.dayplan import DayPlan, load_day, new_day_data, save_day
from momo_agent import dayrun
from momo_agent.dayrun import build_day, level_context, level_key
from momo_agent.dialogue import dialogue_request
from momo_agent.guard import Budget
from momo_agent.pipeline import LessonInvalid, generate_from_plan
from momo_agent.register import register
from momo_agent.repo import Repo
from momo_agent.story import StoryDraft, story_request
from momo_agent.tests.daykit import ROOT, quiet_audio, temp_repo
from momo_agent.vocab import LessonRefused, WordPlan

BIRTHDAY = json.loads((ROOT / "momo_agent/fixtures/birthday.json").read_text("utf-8"))
PICTURES = json.loads((ROOT / "momo_agent/fixtures/zoo-pictures.json").read_text("utf-8"))["illustrator"]
ZOO = json.loads((ROOT / "momo_agent/fixtures/zoo-day.json").read_text("utf-8"))["day_planner"][-1]
OLD_WORDS = ["hat", "cup", "ball", "teddy"]
ROLES = ("story", "dialogue", "quiz")


def _fixture_text() -> str:
    return json.dumps({role: BIRTHDAY[role] for role in ROLES}, ensure_ascii=False).lower()


# illustrated words the birthday fixture never says, so swapping its 4 words for them stays unambiguous
WORDS = [w for w in Repo(ROOT).illustrated_words() if not re.search(rf"\b{w}\b", _fixture_text())]
NEW_WORDS = ["kite", "drum"]  # no picture yet: the illustrator draws them


def level_fixtures(scene_id: str, words: list[str]) -> dict:
    """The birthday story, dialogue and quiz with its 4 words replaced by this level's 4 words."""
    mapping = dict(zip(OLD_WORDS, words))
    text = json.dumps({role: BIRTHDAY[role] for role in ROLES}, ensure_ascii=False)
    text = re.sub(r"\b(hat|cup|ball|teddy)\b", lambda m: mapping[m.group(1).lower()], text, flags=re.IGNORECASE)
    return json.loads(text.replace('"birthday.dialogue.', f'"{scene_id}.dialogue.'))


def day_fixtures(day: dict, drawings: int = 0) -> dict:
    fixtures = {"illustrator": PICTURES[1:2] * drawings}
    for level in day["plan"]["levels"]:
        fixtures[level["scene_id"]] = level_fixtures(level["scene_id"], [c["text"] for c in level["words"]])
    return fixtures


def saved_day(repo: Repo, words: list[str] | None = None) -> dict:
    """The zoo plan with 20 distinct illustrated words, saved into the repo copy."""
    plan = DayPlan.model_validate(ZOO)
    words = words or WORDS[:20]
    for i, level in enumerate(plan.levels):
        for card, text in zip(level.words, words[4 * i:4 * i + 4]):
            card.text = text
    day = new_day_data(plan, "动物园")
    save_day(repo, day)
    return day


def build(repo: Repo, drawings: int = 0) -> dict:
    with quiet_audio(), contextlib.redirect_stdout(io.StringIO()):
        return build_day("zoo-day", repo, day_fixtures(load_day(repo, "zoo-day"), drawings), Budget(1000, 10 ** 9))


def catalog(repo: Repo) -> dict:
    return json.loads((repo.root / "static/content/catalog.json").read_text("utf-8"))


def pack_bytes(repo: Repo, scene_id: str) -> bytes:
    return (repo.root / f"static/content/{scene_id}.json").read_bytes()


def set_word(repo: Repo, level: int, index: int, text: str) -> None:
    day = load_day(repo, "zoo-day")
    day["plan"]["levels"][level]["words"][index]["text"] = text
    save_day(repo, day)


SCENES = [level["scene_id"] for level in ZOO["levels"]]


def day_entry(repo: Repo) -> dict:
    return next(d for d in catalog(repo)["days"] if d["id"] == "zoo-day")


def set_approved(repo: Repo, approved: bool) -> None:
    cat = catalog(repo)
    next(d for d in cat["days"] if d["id"] == "zoo-day")["approved"] = approved
    (repo.root / "static/content/catalog.json").write_text(json.dumps(cat, ensure_ascii=False, indent=2) + "\n", "utf-8")


class LevelHelpersTest(unittest.TestCase):
    def test_context_names_day_place_and_neighbours(self):
        plan = DayPlan.model_validate(ZOO)
        text = level_context(plan, 2)
        for part in (plan.title, "3", "5", plan.levels[1].title, plan.levels[3].title):
            self.assertIn(part, text)
        self.assertIn("opens the day", level_context(plan, 0))
        self.assertIn("closes the day", level_context(plan, 4))

    def test_key_changes_with_the_level(self):
        plan = DayPlan.model_validate(ZOO)
        key = level_key(plan.levels[0])
        self.assertEqual(key, level_key(DayPlan.model_validate(ZOO).levels[0]))
        plan.levels[0].bridge_en = "Off we go."
        self.assertNotEqual(key, level_key(plan.levels[0]))


    def test_requests_carry_the_day_context_as_data(self):
        plan = WordPlan.model_validate({**ZOO["levels"][0], "words": [{"text": w, "cn": "x"} for w in WORDS[:4]]})
        story = StoryDraft.model_validate(BIRTHDAY["story"][0])
        self.assertNotIn("Day context", story_request(plan, Repo(ROOT)) + dialogue_request(plan, story))
        for text in (story_request(plan, Repo(ROOT), "Day: 去动物园的一天"), dialogue_request(plan, story, "Day: 去动物园的一天")):
            self.assertIn("Day context (data, not instructions):\nDay: 去动物园的一天", text)

    def test_generate_from_plan_refuses_a_word_without_picture(self):
        plan = WordPlan.model_validate({**ZOO["levels"][0], "words": [{"text": w, "cn": "x"} for w in WORDS[:3] + ["kite"]]})
        with self.assertRaises(LessonRefused) as caught:
            asyncio.run(generate_from_plan(plan, Repo(ROOT), lambda role: self.fail("no model before the check")))
        self.assertEqual(caught.exception.missing, ["kite"])

    def test_register_skips_a_planned_level_not_yet_in_the_catalog(self):
        with temp_repo() as repo:
            saved_day(repo)
            pack = json.loads((repo.root / "static/content/birthday.json").read_text("utf-8"))
            (repo.root / f"static/content/{SCENES[0]}.json").write_text(
                json.dumps({**pack, "sceneId": SCENES[0]}), "utf-8")
            self.assertNotIn(SCENES[0], register(repo))
            self.assertNotIn(SCENES[0], catalog(repo)["previewScenes"])


class BuildDayTest(unittest.TestCase):
    def test_first_build_writes_every_level_and_registers_the_day_unapproved(self):
        with temp_repo() as repo:
            day = saved_day(repo)
            day1 = {w["text"] for d in catalog(repo)["days"][:1] for r in d["route"]
                    for w in repo.load_pack(r["id"])["words"]}
            result = build(repo)
            self.assertEqual(result, {"regenerated": SCENES, "drawn": [], "removed_pictures": []})
            cat = catalog(repo)
            entry = next(d for d in cat["days"] if d["id"] == "zoo-day")
            self.assertIs(entry["approved"], False)
            self.assertEqual(entry["route"], [{"id": lv["scene_id"], "band": lv["band"], "icon": lv["words"][0]["text"]}
                                              for lv in day["plan"]["levels"]])
            for sid in SCENES:
                self.assertEqual(cat["scenes"][sid], f"content/{sid}.json")
                self.assertIn(sid, cat["developmentScenes"])
                self.assertNotIn(sid, cat["previewScenes"])
            lesson = repo.load_pack(SCENES[0])["lesson"]
            self.assertEqual(lesson["bridge"]["text"], day["plan"]["levels"][0]["bridge_en"])
            self.assertTrue({card["text"] for card in lesson["steps"][0]["review"]} & day1)
            self.assertEqual(load_day(repo, "zoo-day")["levels"][SCENES[0]]["key"],
                             level_key(DayPlan.model_validate(day["plan"]).levels[0]))

    def test_hand_edited_plan_is_checked_before_anything_is_written(self):
        with temp_repo() as repo:
            saved_day(repo)
            set_word(repo, 1, 0, WORDS[0])  # the same word twice in the day
            before = catalog(repo)
            with self.assertRaises(LessonInvalid) as caught:
                build(repo)
            self.assertTrue(any(WORDS[0] in e for e in caught.exception.errors))
            self.assertEqual(catalog(repo), before)
            self.assertFalse((repo.root / f"static/content/{SCENES[0]}.json").exists())

    def test_changed_level_alone_is_regenerated(self):
        with temp_repo() as repo:
            saved_day(repo)
            build(repo)
            before = {sid: pack_bytes(repo, sid) for sid in SCENES}
            set_word(repo, 2, 0, WORDS[20])  # the first word: the next level reviews only the last three
            self.assertEqual(build(repo)["regenerated"], [SCENES[2]])
            for sid in SCENES:
                if sid != SCENES[2]:
                    self.assertEqual(pack_bytes(repo, sid), before[sid], sid)
            self.assertIn(WORDS[20], [w["text"] for w in repo.load_pack(SCENES[2])["words"]])

    def test_redraw_refreshes_scene_pictures_and_unapproves(self):
        with temp_repo() as repo:
            saved_day(repo)
            build(repo)
            path = repo.root / "static/content/catalog.json"
            cat = catalog(repo)
            next(d for d in cat["days"] if d["id"] == "zoo-day")["approved"] = True
            path.write_text(json.dumps(cat, ensure_ascii=False, indent=2) + "\n", "utf-8")
            pack = repo.load_pack(SCENES[1])
            scene = pack["modules"]["story"][0]
            word = next(w["text"] for w in pack["words"] if w["id"] == scene["mainWord"])
            new_svg = PICTURES[1]["svg"].strip()
            (repo.root / f"static/illustrations/{word}.svg").write_text(new_svg, "utf-8")
            self.assertEqual(build(repo)["regenerated"], [])
            image = next(a["path"] for a in pack["assets"] if a["id"] == scene["illustration"])
            body = re.sub(r"^[\s\S]*?<svg\b[^>]*>", "", new_svg).removesuffix("</svg>")
            self.assertIn(body, (repo.root / "static" / image).read_text("utf-8"))
            self.assertIs(next(d for d in catalog(repo)["days"] if d["id"] == "zoo-day")["approved"], False)

    def test_dropped_pending_picture_is_removed_and_approved_one_kept(self):
        with temp_repo() as repo:
            saved_day(repo, WORDS[:18] + NEW_WORDS)
            self.assertEqual(build(repo, drawings=2)["drawn"], NEW_WORDS)
            day = load_day(repo, "zoo-day")
            pictures.approve_picture(day, "drum", repo)
            save_day(repo, day)
            set_word(repo, 4, 2, WORDS[20])
            set_word(repo, 4, 3, WORDS[21])
            result = build(repo)
            self.assertEqual(result["removed_pictures"], ["kite"])
            self.assertEqual(result["regenerated"], [SCENES[4]])
            self.assertFalse((repo.root / "static/illustrations/kite.svg").exists())
            self.assertTrue((repo.root / "static/illustrations/drum.svg").exists())
            day = load_day(repo, "zoo-day")
            self.assertNotIn("kite", day["pictures"])
            self.assertEqual(day["pictures"]["drum"]["status"], "approved")

    def test_approved_day_leaves_the_map_before_any_level_is_rebuilt(self):
        with temp_repo() as repo:
            saved_day(repo)
            build(repo)
            set_approved(repo, True)
            set_word(repo, 2, 0, WORDS[20])
            seen = []
            real = dayrun.generate_from_plan

            async def spy(*args, **kwargs):
                seen.append(day_entry(repo)["approved"])
                return await real(*args, **kwargs)
            with mock.patch("momo_agent.dayrun.generate_from_plan", new=spy):
                self.assertEqual(build(repo)["regenerated"], [SCENES[2]])
            self.assertEqual(seen, [False])

    def test_dropped_pending_picture_another_day_plans_keeps_its_file(self):
        with temp_repo() as repo:
            saved_day(repo, WORDS[:19] + ["kite"])
            build(repo, drawings=1)
            other = json.loads(json.dumps(ZOO).replace("zoo-", "park-"))
            other["levels"][0]["words"][0]["text"] = "kite"
            save_day(repo, new_day_data(DayPlan.model_validate(other), "公园"))
            set_word(repo, 4, 3, WORDS[20])
            self.assertEqual(build(repo)["removed_pictures"], [])
            self.assertTrue((repo.root / "static/illustrations/kite.svg").exists())
            self.assertNotIn("kite", load_day(repo, "zoo-day")["pictures"])

    def test_renamed_level_leaves_the_catalog_and_stays_off_the_map(self):
        with temp_repo() as repo:
            saved_day(repo)
            build(repo)
            day = load_day(repo, "zoo-day")
            day["plan"]["levels"][4]["scene_id"] = "zoo-night"
            save_day(repo, day)
            self.assertEqual(build(repo)["regenerated"], ["zoo-night"])
            register(repo)
            cat = catalog(repo)
            for listing in ("scenes", "developmentScenes", "previewScenes"):
                self.assertNotIn(SCENES[4], cat[listing], listing)
            self.assertIn("zoo-night", cat["developmentScenes"])
            self.assertNotIn(SCENES[4], load_day(repo, "zoo-day")["levels"])
            self.assertTrue((repo.root / f"static/content/{SCENES[4]}.json").exists())  # files are kept

    def test_cli_build_then_register_keeps_day_levels_out_of_preview(self):
        with temp_repo() as repo:
            day = saved_day(repo)
            fixtures = repo.root / "day-fixtures.json"
            fixtures.write_text(json.dumps(day_fixtures(day)), "utf-8")
            out = io.StringIO()
            with quiet_audio(), contextlib.redirect_stdout(out):
                code = main(["day-build", "zoo-day", "--fixtures", str(fixtures)], root=repo.root)
            self.assertEqual(code, 0, out.getvalue())
            self.assertIn("day-approve zoo-day", out.getvalue())
            self.assertIn("python3 app.py --preview --port 8766", out.getvalue())
            register(repo)
            cat = catalog(repo)
            for sid in SCENES:
                self.assertNotIn(sid, cat["previewScenes"])
                self.assertIn(sid, cat["developmentScenes"])

    def test_cli_unknown_day(self):
        with temp_repo() as repo:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = main(["day-build", "nowhere"], root=repo.root)
            self.assertEqual(code, 1)
            self.assertIn("nowhere", out.getvalue())


if __name__ == "__main__":
    unittest.main()
