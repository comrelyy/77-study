import json
import unittest
from pathlib import Path

from momo_agent.fake_model import FixtureModel
from momo_agent.llm import make_model
from momo_agent.repo import Repo
from momo_agent.tools import make_word_tools
from momo_agent.vocab import LessonRefused, plan_words

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "momo_agent/fixtures"


def fixtures(theme):
    return json.loads((FIXTURES / f"{theme}.json").read_text("utf-8"))


class ToolsTest(unittest.IsolatedAsyncioTestCase):
    async def test_two_tools_registered(self):
        toolkit = make_word_tools(Repo(ROOT))
        names = {t["function"]["name"] for t in await toolkit.get_tool_schemas()}
        self.assertEqual(names, {"list_illustrated_words", "check_word"})


class ReActPlanTest(unittest.IsolatedAsyncioTestCase):
    async def test_birthday_calls_tool_then_answers(self):
        model = make_model("planner", fixtures("birthday"))
        self.assertIsInstance(model, FixtureModel)
        plan = await plan_words("生日会", Repo(ROOT), model)
        self.assertEqual([c.text for c in plan.words], ["hat", "cup", "ball", "teddy"])
        self.assertEqual(len(model.calls), 2)

    async def test_model_is_offered_the_tools(self):
        seen = []
        model = make_model("planner", fixtures("birthday"))
        original = model._call_api

        async def spy(model_name, messages, tools=None, **kw):
            seen.append({t["function"]["name"] for t in tools or []})
            return await original(model_name, messages, tools=tools, **kw)

        model._call_api = spy
        await plan_words("生日会", Repo(ROOT), model)
        self.assertTrue(
            {"list_illustrated_words", "check_word", "GenerateStructuredOutput"} <= seen[0]
        )

    async def test_ocean_still_refused(self):
        with self.assertRaises(LessonRefused):
            await plan_words("海边", Repo(ROOT), make_model("planner", fixtures("ocean")))
