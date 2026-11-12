import contextlib
import copy
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from momo_agent import quiz, tts
from momo_agent.__main__ import main
from momo_agent.fake_model import FixtureModel
from momo_agent.quiz import QuizDraft
from momo_agent.repo import Repo
from momo_agent.tests import daykit
from momo_agent.tests.test_output import FIXTURES, ROOT, make_repo, quiz_repo

PARK_FIXTURE = FIXTURES / "park-quiz.json"


def setUpModule():
    # every theme now voices its missing audio on any platform; tests use the silent stub, never the model
    patcher = mock.patch("momo_agent.tts.synthesize", new=daykit.silence)
    patcher.start()
    unittest.addModuleCleanup(patcher.stop)


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
            self.assertIn("lesson audio files", out)
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

    def test_generate_also_writes_quiz_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            code, out = run(root, "generate", "生日会", "--fixtures", str(FIXTURES / "birthday.json"), "--overwrite")
            self.assertEqual(code, 0, out)
            overlay = json.loads((root / "content-lesson/birthday.json").read_text("utf-8"))
            self.assertIs(overlay["reviewed"], False)
            pack = json.loads((root / "static/content/birthday.json").read_text("utf-8"))
            self.assertIs(pack["lesson"]["reviewed"], False)
            self.assertIn("quiz", [s["kind"] for s in pack["lesson"]["steps"]])
            self.assertEqual(out.count("model calls"), 1)  # one shared budget summary
            lesson_audio = [a for a in pack["assets"] if a["kind"] == "audio" and "/lesson/" in a["path"]]
            self.assertTrue(lesson_audio)
            self.assertTrue(all((root / "static" / a["path"]).exists() for a in lesson_audio))

    def test_generate_never_approves(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            stale = root / "content-lesson/birthday.json"
            stale.write_text(json.dumps({"reviewed": True}), "utf-8")
            code, out = run(root, "generate", "生日会", "--fixtures", str(FIXTURES / "birthday.json"), "--overwrite")
            self.assertEqual(code, 0, out)
            self.assertIs(json.loads(stale.read_text("utf-8"))["reviewed"], False)

    def test_generate_quiz_failure_keeps_theme_and_exits_1(self):
        fx = json.loads((FIXTURES / "birthday.json").read_text("utf-8"))
        fx["quiz"] = []
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            fixtures = Path(tmp) / "no-quiz.json"
            fixtures.write_text(json.dumps(fx, ensure_ascii=False), "utf-8")
            code, out = run(root, "generate", "生日会", "--fixtures", str(fixtures), "--overwrite")
            self.assertEqual(code, 1, out)
            self.assertIn("题目没有生成：", out)
            self.assertIn("python -m momo_agent quiz birthday", out)
            self.assertTrue((root / "static/content/birthday.json").exists())
            self.assertFalse((root / "content-lesson/birthday.json").exists())

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

    def test_approve_refuses_invalid_overlay_and_keeps_it_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            self.assertEqual(run(root, "quiz", "park", "--fixtures", str(PARK_FIXTURE))[0], 0)
            path = root / "content-lesson/park.json"
            overlay = json.loads(path.read_text("utf-8"))
            overlay["replies"][0]["dialogueId"] = "park.dialogue.nowhere"
            path.write_text(json.dumps(overlay, indent=2, ensure_ascii=False) + "\n", "utf-8")
            before = path.read_text("utf-8")
            code, out = run(root, "quiz-approve", "park")
            self.assertEqual(code, 1, out)
            self.assertEqual(path.read_text("utf-8"), before)
            self.assertIs(json.loads(path.read_text("utf-8"))["reviewed"], False)
            self.assertIs(json.loads((root / "static/content/park.json").read_text("utf-8"))["lesson"]["reviewed"], False)

    def test_approve_restores_overlay_when_lesson_build_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            self.assertEqual(run(root, "quiz", "park", "--fixtures", str(PARK_FIXTURE))[0], 0)
            path = root / "content-lesson/park.json"
            before = path.read_text("utf-8")
            with mock.patch.object(quiz, "run_lesson_build", side_effect=RuntimeError("boom")):
                code, out = run(root, "quiz-approve", "park")
            self.assertEqual(code, 1, out)
            self.assertIn("boom", out)
            self.assertEqual(path.read_text("utf-8"), before)

    def test_approve_refuses_stale_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp)
            self.assertEqual(run(root, "quiz", "park", "--fixtures", str(PARK_FIXTURE))[0], 0)
            path = root / "content-lesson/park.json"
            overlay = json.loads(path.read_text("utf-8"))
            overlay["sourceVersion"] = "0.0.1"
            path.write_text(json.dumps(overlay, indent=2, ensure_ascii=False) + "\n", "utf-8")
            before = path.read_text("utf-8")
            code, out = run(root, "quiz-approve", "park")
            self.assertEqual(code, 1, out)
            self.assertIn("旧内容", out)
            self.assertEqual(path.read_text("utf-8"), before)

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

    def test_quiz_audio_voices_handwritten_themes_on_any_platform(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = quiz_repo(tmp, "park")
            for platform in ("darwin", "win32"):
                with mock.patch("sys.platform", platform):
                    code, out = run(root, "quiz-audio", "park")
                self.assertEqual(code, 0, out)
                self.assertIn("Synthesised", out)

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
            # the repo now ships the birthday lesson audio; this test needs it missing
            shutil.rmtree(root / "static/audio/birthday/lesson")
            copied = root / "static/audio/s4-birthday-manifest.json"
            shipped = json.loads(copied.read_text("utf-8"))
            shipped["entries"] = [e for e in shipped["entries"] if "/lesson/" not in e["path"]]
            copied.write_text(json.dumps(shipped), "utf-8")
            fixtures = str(FIXTURES / "birthday.json")
            with mock.patch.object(tts, "synthesize", fake_say):
                code, out = run(root, "quiz", "birthday", "--fixtures", fixtures)
            self.assertEqual(code, 0, out)
            self.assertEqual(sorted(t for t, _ in spoken), sorted(
                ["I want a cup.", "I see a hat.", "Let us hug the teddy.", "I kick the ball.", "My cup is blue.",
                 "I like the hat.", "The room is tidy. Surprise! It is a party!", "car", "spoon", "tomato", "A Birthday Party"]))
            # the lesson title, the route bridge and the review words borrowed from earlier scenes (absent from this temp repo) are
            # synthesised too; the quiz lines themselves are spoken by the bunny
            self.assertTrue(all(role == "bunny" for t, role in spoken if t.endswith(".") and t != "The room is tidy. Surprise! It is a party!"))
            self.assertNotIn("make-s4-audio.ps1", out)
            manifest = json.loads((root / "static/audio/s4-birthday-manifest.json").read_text("utf-8"))
            lesson = [e for e in manifest["entries"] if "/lesson/" in e["path"]]
            self.assertEqual(len(lesson), 8)  # 6 quiz lines + the route bridge + the title
            self.assertEqual(len({e["id"] for e in manifest["entries"]}), len(manifest["entries"]))
            # a second run finds nothing missing
            spoken.clear()
            with mock.patch.object(tts, "synthesize", fake_say):
                code, out = run(root, "quiz-audio", "birthday")
            self.assertEqual((code, spoken), (0, []))


class RenderMissingAudioTest(unittest.TestCase):
    def test_picnic_uses_unsuffixed_manifest_name(self):
        pack = {"sceneId": "picnic", "contentVersion": "1.0.0", "assets": [
            {"id": "picnic.b", "kind": "audio", "path": "audio/picnic/b.wav", "text": "new", "language": "en-US", "role": "bunny"}]}
        with tempfile.TemporaryDirectory() as tmp:
            static = Path(tmp)
            (static / "audio").mkdir()
            (static / "audio/s4-manifest.json").write_text(json.dumps({"entries": []}), "utf-8")
            with mock.patch.object(tts, "synthesize", lambda t, r, out: Path(out).write_bytes(b"new") and
                                   {"voice": "v", "rate": 1, "volume": 2}):
                tts.render_missing_audio(pack, static)
            entries = json.loads((static / "audio/s4-manifest.json").read_text("utf-8"))["entries"]
            self.assertEqual([e["id"] for e in entries], ["picnic.b"])

    def test_missing_manifest_is_a_clear_error(self):
        pack = {"sceneId": "demo", "contentVersion": "1.0.0", "assets": [
            {"id": "demo.b", "kind": "audio", "path": "audio/demo/b.wav", "text": "new", "language": "en-US", "role": "bunny"}]}
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(tts, "synthesize", lambda t, r, out: Path(out).write_bytes(b"new") and
                                   {"voice": "v", "rate": 1, "volume": 2}):
                with self.assertRaisesRegex(RuntimeError, "s4-demo-manifest.json"):
                    tts.render_missing_audio(pack, Path(tmp))


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
