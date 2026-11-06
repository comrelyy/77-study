import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from momo_agent.fake_model import FixtureModel
from momo_agent.llm import NoStructuredOutput, make_model
from momo_agent.pipeline import SceneIdConflict, generate_lesson
from momo_agent.repo import Repo
from momo_agent.tests.test_output import FIXTURES, ROOT, make_repo, run_cli
from momo_agent.vocab import plan_words
from agentscope.message import TextBlock
from agentscope.model import ChatResponse


def birthday(scene_id=None):
    fx = copy.deepcopy(json.loads((FIXTURES / "birthday.json").read_text("utf-8")))
    if scene_id:
        fx["planner"][-1]["scene_id"] = scene_id
    return fx


def snapshot(root: Path) -> dict[str, bytes]:
    return {str(p.relative_to(root)): p.read_bytes() for p in (root / "static").rglob("*") if p.is_file()}


class ProviderIsFakeInTestsTest(unittest.TestCase):
    def test_package_forces_fake_provider(self):
        self.assertEqual(os.environ["MOMO_LLM_PROVIDER"], "fake")


class SceneIdProtectionTest(unittest.IsolatedAsyncioTestCase):
    async def lesson(self, repo, fx, overwrite=False):
        return await generate_lesson("生日会", repo, lambda role: make_model(role, fx), overwrite)

    async def test_non_theme_content_files_are_refused(self):
        for name in ("catalog", "characters"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                repo = Repo(make_repo(tmp))
                before = (repo.root / f"static/content/{name}.json").read_bytes()
                with self.assertRaises(SceneIdConflict):
                    await self.lesson(repo, birthday(name), overwrite=True)
                self.assertEqual((repo.root / f"static/content/{name}.json").read_bytes(), before)

    async def test_generated_theme_needs_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Repo(make_repo(tmp))
            with self.assertRaisesRegex(SceneIdConflict, "--overwrite"):
                await self.lesson(repo, birthday())
            self.assertEqual((await self.lesson(repo, birthday(), overwrite=True))["sceneId"], "birthday")


class NoStructuredOutputTest(unittest.IsolatedAsyncioTestCase):
    def silent_model(self):
        model = FixtureModel([], role="planner")

        async def say_hello(*args, **kw):
            return ChatResponse(content=[TextBlock(text="hello")], is_last=True)

        model._call_api = say_hello
        return model

    async def test_planner_without_structured_answer(self):
        with self.assertRaisesRegex(NoStructuredOutput, "planner 模型没有返回结构化结果"):
            await plan_words("生日会", Repo(ROOT), self.silent_model())

    def test_cli_prints_one_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_repo(tmp)
            with mock.patch("momo_agent.__main__.generate_lesson", side_effect=NoStructuredOutput("story 模型没有返回结构化结果")):
                code, out = run_cli(root, "generate", "生日会")
            self.assertEqual((code, out), (1, "Error: story 模型没有返回结构化结果\n"))

    def test_cli_reports_missing_key(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"MOMO_LLM_PROVIDER": "openai"}):
            code, out = run_cli(make_repo(tmp), "generate", "生日会")
            self.assertEqual(code, 1)
            self.assertEqual(out, "Error: MOMO_LLM_API_KEY is required when MOMO_LLM_PROVIDER is not fake\n")


class StagingTest(unittest.TestCase):
    def test_cli_refuses_existing_theme_without_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_repo(tmp)
            before = snapshot(root)
            code, out = run_cli(root, "generate", "生日会", "--fixtures", str(FIXTURES / "birthday.json"))
            self.assertEqual(code, 1)
            self.assertIn("--overwrite", out)
            self.assertEqual(snapshot(root), before)

    def test_failure_before_the_move_leaves_static_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_repo(tmp)
            before = snapshot(root)

            def broken(pack, static_root):
                (Path(static_root) / "audio").mkdir(parents=True)
                (Path(static_root) / "audio/half.wav").write_bytes(b"x")
                raise RuntimeError("speech engine crashed")

            with mock.patch("momo_agent.scenes.render_audio", broken):
                code, out = run_cli(root, "generate", "生日会", "--fixtures", str(FIXTURES / "birthday.json"), "--overwrite")
            self.assertEqual((code, out), (1, "Error: speech engine crashed\n"))
            self.assertEqual(snapshot(root), before)

    def test_old_audio_folder_is_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_repo(tmp)
            stale = root / "static/audio/birthday/v0-1-0/stale.wav"
            stale.parent.mkdir(parents=True, exist_ok=True)
            stale.write_bytes(b"old")

            def fake_audio(pack, static_root):
                for a in pack["assets"]:
                    if a["kind"] == "audio":
                        out = Path(static_root) / a["path"]
                        out.parent.mkdir(parents=True, exist_ok=True)
                        out.write_bytes(b"new")
                return {}

            with mock.patch("momo_agent.scenes.render_audio", fake_audio), \
                    mock.patch("momo_agent.scenes.validate_pack", return_value=[]):
                code, out = run_cli(root, "generate", "生日会", "--fixtures", str(FIXTURES / "birthday.json"), "--overwrite")
            self.assertEqual(code, 0, out)
            self.assertFalse(stale.exists())
            self.assertTrue(any((root / "static/audio/birthday/v0-1-0").glob("*.wav")))


if __name__ == "__main__":
    unittest.main()
