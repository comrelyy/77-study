import json
import unittest
from pathlib import Path

from momo_agent.dialogue import DialogueDraft, DialogueRound, Reply, check_dialogue, write_dialogue
from momo_agent.game import GAME_AFTER_DIALOGUE, build_listen_pack
from momo_agent.llm import make_model
from momo_agent.story import StoryDraft
from momo_agent.vocab import WordCard, WordPlan

ROOT = Path(__file__).resolve().parents[2]
WORDS = ["hat", "cup", "ball", "teddy"]


def reply(**fields):
    base = dict(text="I want the hat.", cn="x", image_word="hat", follow_up="Nice hat.")
    base.update(fields)
    return Reply(**base)


def round_(n_replies=2, **reply_fields):
    return DialogueRound(cn="x", question="What do you want?", replies=[reply(**reply_fields) for _ in range(n_replies)])


def draft(first=None):
    return DialogueDraft(rounds=[first or round_()] + [round_() for _ in range(5)])


class CheckDialogueTest(unittest.TestCase):
    def test_good_draft(self):
        self.assertEqual(check_dialogue(draft(), WORDS), [])

    def test_four_replies(self):
        errors = check_dialogue(draft(round_(4)), WORDS)
        self.assertTrue(any("2–3" in e for e in errors))

    def test_one_reply(self):
        self.assertTrue(any("2–3" in e for e in check_dialogue(draft(round_(1)), WORDS)))

    def test_round_count(self):
        d = DialogueDraft(rounds=draft().rounds[:5])
        self.assertTrue(any("6 rounds" in e for e in check_dialogue(d, WORDS)))

    def test_long_reply(self):
        errors = check_dialogue(draft(round_(text=" ".join(["word"] * 9))), WORDS)
        self.assertTrue(any("1–8" in e for e in errors))

    def test_long_follow_up(self):
        errors = check_dialogue(draft(round_(follow_up=" ".join(["word"] * 16))), WORDS)
        self.assertTrue(any("follow_up" in e for e in errors))

    def test_long_question(self):
        first = DialogueRound(cn="x", question=" ".join(["word"] * 16), replies=[reply(), reply()])
        self.assertTrue(any("question" in e for e in check_dialogue(draft(first), WORDS)))

    def test_image_word_must_be_target(self):
        errors = check_dialogue(draft(round_(image_word="fish")), WORDS)
        self.assertTrue(any("image_word" in e for e in errors))


class ListenPackTest(unittest.TestCase):
    def test_four_questions(self):
        game = build_listen_pack(WORDS)
        self.assertEqual(game["type"], "listen-pack")
        self.assertEqual([q["target"] for q in game["questions"]], WORDS)
        for q in game["questions"]:
            self.assertEqual(q["options"], WORDS)
            self.assertIn(q["target"], q["options"])

    def test_game_after_dialogue(self):
        self.assertEqual(GAME_AFTER_DIALOGUE, (2, 4, 5, 6))


class WriteDialogueTest(unittest.IsolatedAsyncioTestCase):
    async def test_birthday_dialogue(self):
        fx = json.loads((ROOT / "momo_agent/fixtures/birthday.json").read_text("utf-8"))
        plan = WordPlan(
            scene_id="birthday", title="生日会", goal="g", function="naming",
            words=[WordCard(text=t, cn="x") for t in WORDS],
        )
        story = StoryDraft.model_validate(fx["story"][0])
        model = make_model("dialogue", fx)
        result = await write_dialogue(plan, story, model)
        self.assertEqual(check_dialogue(result, WORDS), [])
        sent = " ".join(m.get_text_content() for m in model.calls[0] if m.role == "user")
        self.assertIn(story.scenes[0].momo_line, sent)
        self.assertIn("hat, cup, ball, teddy", sent)


if __name__ == "__main__":
    unittest.main()
