"""Chapter 3: read-only tools the planner can call to check illustrations itself."""
import json

from agentscope.message import TextBlock
from agentscope.tool import FunctionTool, ToolResponse, Toolkit

from momo_agent.repo import Repo


def make_word_tools(repo: Repo) -> Toolkit:
    # is_read_only=True matters: AgentScope 2.0 stops and waits for permission on other tools.
    def list_illustrated_words() -> ToolResponse:
        """List every English word that has an illustration."""
        text = json.dumps(repo.illustrated_words())
        return ToolResponse(content=[TextBlock(text=text)])

    def check_word(text: str) -> ToolResponse:
        """Check whether one English word (lowercase, singular) has an illustration."""
        word = text.strip().lower()
        result = {"text": word, "has_image": word in repo.illustrated_words()}
        return ToolResponse(content=[TextBlock(text=json.dumps(result))])

    return Toolkit(
        tools=[
            FunctionTool(list_illustrated_words, is_read_only=True),
            FunctionTool(check_word, is_read_only=True),
        ]
    )
