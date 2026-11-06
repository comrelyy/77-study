import json

from pydantic import BaseModel

from agentscope.credential import CredentialBase
from agentscope.formatter import OpenAIChatFormatter
from agentscope.message import TextBlock, ToolCallBlock
from agentscope.model import ChatModelBase, ChatResponse

STRUCTURED_TOOL = "GenerateStructuredOutput"


class _NoParameters(BaseModel):
    pass


class FixtureModel(ChatModelBase):
    """A model that replays canned responses, so the agent runs offline."""

    def __init__(self, responses: list[dict], role: str = "model"):
        super().__init__(
            credential=CredentialBase(name="fake"),
            model="fixture",
            parameters=_NoParameters(),
            stream=False,
        )
        self.formatter = OpenAIChatFormatter()
        self.role = role
        self.responses = list(responses)
        self.calls = []

    async def _call_api(self, model_name, messages, tools=None, tool_choice=None, **kw):
        self.calls.append(messages)
        if not self.responses:
            raise RuntimeError(f"fixture exhausted for {self.role}")
        payload = self.responses.pop(0)
        names = [t["function"]["name"] for t in tools or []]
        if STRUCTURED_TOOL in names:
            block = ToolCallBlock(
                id=f"call_{len(self.calls)}",
                name=STRUCTURED_TOOL,
                input=json.dumps(payload),
            )
        else:
            block = TextBlock(text=json.dumps(payload))
        return ChatResponse(content=[block], is_last=True)
