import json
import unittest
from pathlib import Path

from momo_agent.examples import pick_examples
from momo_agent.llm import make_model
from momo_agent.repo import Repo
from momo_agent.story import StoryDraft, StoryScene, check_story, write_story
from momo_agent.vocab import WordCard, WordPlan

ROOT = Path(__file__).resolve().parents[2]
WORDS = ["hat", "cup", "ball", "teddy"]


def scene(n, narration=None, main_word="hat", **lines):
    fields = dict(
        title="t", translation="x", main_word=main_word,
        narration=narration or f"Scene {n} has a hat, a cup, a ball and a teddy.",
        momo_line="Hello.", bunny_line="Hi.", momo_first=True,
    )
    fields.update(lines)
    return StoryScene(**fields)


def draft(**first_scene):
    return StoryDraft(scenes=[scene(1, **first_scene)] + [scene(n) for n in range(2, 7)])


class PickExamplesTest(unittest.TestCase):
    def test_most_overlap_first(self):
        examples = pick_examples(Repo(ROOT), ["cup", "bread"])
        self.assertEqual(examples[0]["sceneId"], "breakfast")
        self.assertEqual(len(examples), 2)
        first = examples[0]["scenes"][0]
        self.assertEqual(set(first), {"title", "translation", "segments"})
        self.assertEqual(set(first["segments"][0]), {"speaker", "text"})


class CheckStoryTest(unittest.TestCase):
    def test_good_draft(self):
        self.assertEqual(check_story(draft(), WORDS), [])

    def test_missing_word(self):
        d = StoryDraft(scenes=[scene(n, narration=f"Scene {n} has a hat, a cup and a ball.") for n in range(1, 7)])
        self.assertIn("target word missing: teddy", check_story(d, WORDS))

    def test_whole_word_only(self):
        d = StoryDraft(scenes=[scene(n, narration=f"Scene {n} has a hat, a cup, a ball and teddys.") for n in range(1, 7)])
        self.assertIn("target word missing: teddy", check_story(d, WORDS))

    def test_long_line(self):
        errors = check_story(draft(momo_line=" ".join(["word"] * 16)), WORDS)
        self.assertTrue(any("1–15" in e for e in errors))

    def test_empty_line(self):
        errors = check_story(draft(bunny_line=" "), WORDS)
        self.assertTrue(any("1–15" in e for e in errors))

    def test_scene_count(self):
        d = StoryDraft(scenes=draft().scenes[:5])
        self.assertTrue(any("6 scenes" in e for e in check_story(d, WORDS)))

    def test_main_word_must_be_target(self):
        errors = check_story(draft(main_word="fish"), WORDS)
        self.assertTrue(any("main_word" in e for e in errors))

    def test_main_word_must_appear_in_its_scene(self):
        errors = check_story(draft(main_word="teddy", narration="Scene 1 has a hat, a cup and a ball."), WORDS)
        self.assertIn("scene 1: main_word teddy not mentioned", errors)

    def test_case_insensitive_word(self):
        d = draft(narration="Scene 1 has a Hat, a cup, a ball and a teddy.")
        self.assertEqual(check_story(d, ["hat"]), [])

    def test_duplicate_narration(self):
        d = StoryDraft(scenes=[scene(n, narration="Same hat cup ball teddy.") for n in range(1, 7)])
        self.assertIn("scene narrations must all be different", check_story(d, WORDS))


class WriteStoryTest(unittest.IsolatedAsyncioTestCase):
    async def test_birthday_story(self):
        fx = json.loads((ROOT / "momo_agent/fixtures/birthday.json").read_text("utf-8"))
        plan = WordPlan(
            scene_id="birthday", title="生日会", goal="g", function="naming",
            words=[WordCard(text=t, cn="x") for t in WORDS],
        )
        model = make_model("story", fx)
        story = await write_story(plan, Repo(ROOT), model)
        self.assertEqual(check_story(story, WORDS), [])
        sent = " ".join(m.get_text_content() for m in model.calls[0] if m.role == "user")
        example = pick_examples(Repo(ROOT), WORDS)[0]["scenes"][0]["segments"][0]["text"]
        self.assertIn(example, sent)
        self.assertIn("hat, cup, ball, teddy", sent)


if __name__ == "__main__":
    unittest.main()
