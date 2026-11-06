import os
import unittest
from unittest import mock

from agentscope.agent import Agent
from agentscope.message import UserMsg
from pydantic import BaseModel

from momo_agent.fake_model import FixtureModel
from momo_agent.llm import make_model


class X(BaseModel):
    x: int


def _agent(model):
    return Agent(name="t", system_prompt="s", model=model)


class MakeModelTest(unittest.TestCase):
    def test_fake_is_default(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            m = make_model("planner", {"planner": [{"x": 1}]})
        self.assertIsInstance(m, FixtureModel)

    def test_real_provider_requires_key(self):
        env = {"MOMO_LLM_PROVIDER": "openai"}
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError) as ctx:
                make_model("planner")
        self.assertIn("MOMO_LLM_API_KEY", str(ctx.exception))


class FixtureModelTest(unittest.IsolatedAsyncioTestCase):
    async def test_fixture_answers_structured_output(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            m = make_model("planner", {"planner": [{"x": 1}]})
        msg = await _agent(m).reply(
            UserMsg(name="user", content="hi"), structured_schema=X
        )
        self.assertEqual(msg.structured_output, {"x": 1})
        self.assertEqual(len(m.calls), 1)

    async def test_exhausted_raises(self):
        m = FixtureModel([{"x": 1}], role="planner")
        agent = _agent(m)
        await agent.reply(UserMsg(name="user", content="hi"), structured_schema=X)
        with self.assertRaises(RuntimeError) as ctx:
            await agent.reply(UserMsg(name="user", content="again"), structured_schema=X)
        self.assertIn("planner", str(ctx.exception))
