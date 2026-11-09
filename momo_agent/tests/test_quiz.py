import contextlib
import copy
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from momo_agent import quiz, tts
from momo_agent.__main__ import main
from momo_agent.fake_model import FixtureModel
from momo_agent.quiz import QuizDraft
from momo_agent.repo import Repo
from momo_agent.tests.test_output import FIXTURES, ROOT, make_repo

PARK_FIXTURE = FIXTURES / "park-quiz.json"


def quiz_repo(tmp: str, *scenes: str) -> Path:
    """A throwaway repo with the files lesson-build needs; the real repo is never written."""
    root = make_repo(tmp)
    shutil.copy(ROOT / "lesson-build.cjs", root / "lesson-build.cjs")
    (root / "static/core").mkdir(parents=True)
    shutil.copy(ROOT / "static/core/model.js", root / "static/core/model.js")
    (root / "content-lesson").mkdir()
    for scene in scenes:
        src = ROOT / "content-lesson" / f"{scene}.json"
        if src.exists():
            shutil.copy(src, root / "content-lesson" / f"{scene}.json")
    audio = ROOT / "static/audio"
    (root / "static/audio").mkdir(exist_ok=True)
    for scene in scenes:
        manifest = audio / f"s4-{scene}-manifest.json"
        if manifest.exists():
            shutil.copy(manifest, root / "static/audio" / manifest.name)
    return root


def run(root: Path, *argv: str) -> tuple[int, str]:
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = main(list(argv), root=root)
    return code, out.getvalue()


def park_draft() -> dict:
    return copy.deepcopy(json.loads(PARK_FIXTURE.read_text("utf-8"))["quiz"][0])


def park_pack() -> dict:
    return Repo(ROOT).load_pack("park")


class CheckQuizTest(unittest.TestCase):
    def errors(self, mutate=None, pack=None) -> list[str]:
        raw = park_draft()
        if mutate:
            mutate(raw)
        return quiz.check_quiz(QuizDraft.model_validate(raw), pack or park_pack())

    def test_check_quiz_accepts_fixture(self):
        self.assertEqual(self.errors(), [])

    def test_check_quiz_rejects_answer_not_in_scenes(self):
        def mutate(raw):
            raw["questions"][0]["answer"] = "ball"  # scenes 1-2 never mention a ball
            raw["questions"][0]["options"] = ["ball", "tree", "flower"]
        self.assertTrue(any("answer" in e for e in self.errors(mutate)))

    def test_check_quiz_rejects_reply_same_word_as_correct(self):
        def mutate(raw):
            raw["replies"][0].update(word="tree", text="I see the tree.")  # dialogue 1's right answer shows the tree
        self.assertTrue(any("same word" in e for e in self.errors(mutate)))

    def test_check_quiz_rejects_long_reply(self):
        def mutate(raw):
            raw["replies"][0]["text"] = "I want my ball and I want to play with it now"
        self.assertTrue(any("1-8 words" in e for e in self.errors(mutate)))

    def test_check_quiz_counts_rounds(self):
        picnic = Repo(ROOT).load_pack("picnic")
        raw = {"questions": [], "replies": park_draft()["replies"]}  # 6 replies, picnic has 8 rounds
        errors = quiz.check_quiz(QuizDraft.model_validate(raw), picnic)
        self.assertTrue(any("8 replies" in e for e in errors), errors)
        self.assertTrue(any("3 questions" in e for e in errors), errors)

    def test_check_quiz_rejects_known_reply_text_and_bad_option_words(self):
        def mutate(raw):
            raw["replies"][1].update(text="Yes! Leave it growing.", word="bird")
            raw["questions"][1]["options"] = ["ball", "ball", "tree"]
            raw["questions"][2]["question"] = ""
        errors = self.errors(mutate)
        self.assertTrue(any("existing reply" in e for e in errors), errors)
        self.assertTrue(any("distinct" in e for e in errors), errors)
        self.assertTrue(any("question" in e for e in errors), errors)


class GenerateQuizTest(unittest.IsolatedAsyncioTestCase):
    async def test_quiz_rewrite_once(self):
        bad = park_draft()
        bad["questions"][0].update(answer="ball", options=["ball", "tree", "flower"])
        model = FixtureModel([bad, park_draft()], role="quiz")
        rewrites: dict[str, int] = {}
        draft = await quiz.generate_quiz(park_pack(), model, rewrites)
        self.assertEqual(rewrites["quiz"], 1)
        self.assertEqual(draft.questions[0].answer, "tree")


class QuizCommandTest(unittest.TestCase):
    def test_quiz_command_writes_unreviewed_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            code, out = run(root, "quiz", "park", "--fixtures", str(PARK_FIXTURE))
            self.assertEqual(code, 0, out)
            overlay = json.loads((root / "content-lesson/park.json").read_text("utf-8"))
            self.assertIs(overlay["reviewed"], False)
            self.assertEqual(overlay["sourceVersion"], "0.2.0")
            self.assertEqual(len(overlay["quiz"]), 3)
            self.assertEqual(len(overlay["replies"]), 6)
            pack = json.loads((root / "static/content/park.json").read_text("utf-8"))
            self.assertIs(pack["lesson"]["reviewed"], False)
            kinds = [s["kind"] for s in pack["lesson"]["steps"]]
            self.assertIn("quiz", kinds)
            self.assertIn("reply", kinds)
            self.assertIn("make-s4-audio.ps1", out)
            self.assertIn("python -m momo_agent quiz-approve park", out)

    def test_generation_never_approves(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp, "park")
            overlay = root / "content-lesson/park.json"
            stale = json.loads(overlay.read_text("utf-8"))
            stale["reviewed"] = True  # a previous approval must not survive a regeneration
            overlay.write_text(json.dumps(stale), "utf-8")
            code, out = run(root, "quiz", "park", "--fixtures", str(PARK_FIXTURE))
            self.assertEqual(code, 0, out)
            self.assertIs(json.loads(overlay.read_text("utf-8"))["reviewed"], False)
            pack = json.loads((root / "static/content/park.json").read_text("utf-8"))
            self.assertIs(pack["lesson"]["reviewed"], False)

    def test_approve_sets_reviewed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            self.assertEqual(run(root, "quiz", "park", "--fixtures", str(PARK_FIXTURE))[0], 0)
            before = json.loads((root / "static/content/park.json").read_text("utf-8"))
            code, out = run(root, "quiz-approve", "park")
            self.assertEqual(code, 0, out)
            after = json.loads((root / "static/content/park.json").read_text("utf-8"))
            self.assertIs(after["lesson"]["reviewed"], True)
            self.assertNotEqual(after["contentVersion"], before["contentVersion"])
            self.assertIs(json.loads((root / "content-lesson/park.json").read_text("utf-8"))["reviewed"], True)

    def test_approve_without_overlay_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, out = run(quiz_repo(tmp), "quiz-approve", "park")
            self.assertEqual(code, 1)
            self.assertIn("park", out)

    def test_unknown_scene_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, out = run(quiz_repo(tmp), "quiz", "nowhere", "--fixtures", str(PARK_FIXTURE))
            self.assertEqual(code, 1)
            self.assertIn("nowhere", out)

    def test_quiz_audio_refuses_handwritten_on_mac(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp, "park")
            with mock.patch("momo_agent.__main__.sys.platform", "darwin"):
                code, out = run(root, "quiz-audio", "park")
            self.assertEqual(code, 1)
            self.assertIn("make-s4-audio.ps1", out)

    def test_agent_theme_quiz_synthesises_only_missing_audio(self):
        spoken = []

        def fake_say(text, role, out):
            spoken.append((text, role))
            Path(out).write_bytes(b"RIFF" + text.encode())
            return {"voice": "test", "rate": 1, "volume": 100}

        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            shutil.copytree(ROOT / "static/audio/birthday", root / "static/audio/birthday")
            shutil.copy(ROOT / "static/audio/s4-birthday-manifest.json", root / "static/audio/")
            fixtures = str(FIXTURES / "birthday.json")
            with mock.patch.object(tts, "synthesize", fake_say):
                code, out = run(root, "quiz", "birthday", "--fixtures", fixtures)
            self.assertEqual(code, 0, out)
            self.assertEqual(sorted(t for t, _ in spoken), sorted(
                ["I want a cup.", "I see a hat.", "Let us hug the teddy.", "I kick the ball.", "My cup is blue.",
                 "I like the hat."]))
            self.assertTrue(all(role == "bunny" for _, role in spoken))
            self.assertNotIn("make-s4-audio.ps1", out)
            manifest = json.loads((root / "static/audio/s4-birthday-manifest.json").read_text("utf-8"))
            lesson = [e for e in manifest["entries"] if "/lesson/" in e["path"]]
            self.assertEqual(len(lesson), 6)
            self.assertEqual(len({e["id"] for e in manifest["entries"]}), len(manifest["entries"]))
            # a second run finds nothing missing
            spoken.clear()
            with mock.patch.object(tts, "synthesize", fake_say):
                code, out = run(root, "quiz-audio", "birthday")
            self.assertEqual((code, spoken), (0, []))


class RenderMissingAudioTest(unittest.TestCase):
    def test_existing_files_are_kept_and_manifest_gets_new_entries(self):
        pack = {"sceneId": "demo", "contentVersion": "1.0.0", "assets": [
            {"id": "demo.a", "kind": "audio", "path": "audio/demo/a.wav", "text": "old", "language": "en-US", "role": "momo"},
            {"id": "demo.b", "kind": "audio", "path": "audio/demo/lesson/b.wav", "text": "new", "language": "en-US", "role": "bunny"},
            {"id": "demo.i", "kind": "image", "path": "x.svg"}]}
        with tempfile.TemporaryDirectory() as tmp:
            static = Path(tmp)
            (static / "audio/demo").mkdir(parents=True)
            (static / "audio/demo/a.wav").write_bytes(b"keep")
            old_entry = {"id": "demo.a", "path": "audio/demo/a.wav", "text": "old", "sha256": "x"}
            (static / "audio/s4-demo-manifest.json").write_text(json.dumps({"entries": [old_entry]}), "utf-8")
            with mock.patch.object(tts, "synthesize", lambda t, r, out: Path(out).write_bytes(b"new") and
                                   {"voice": "v", "rate": 1, "volume": 2}):
                written = tts.render_missing_audio(pack, static)
            self.assertEqual(written, [static / "audio/demo/lesson/b.wav"])
            self.assertEqual((static / "audio/demo/a.wav").read_bytes(), b"keep")
            entries = json.loads((static / "audio/s4-demo-manifest.json").read_text("utf-8"))["entries"]
            self.assertEqual([e["id"] for e in entries], ["demo.a", "demo.b"])
            self.assertEqual(entries[1]["role"], "bunny")
            self.assertEqual(len(entries[1]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
