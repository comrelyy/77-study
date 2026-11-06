import os

from agentscope.credential import (
    AnthropicCredential,
    DashScopeCredential,
    OpenAICredential,
)
from agentscope.model import (
    AnthropicChatModel,
    ChatModelBase,
    DashScopeChatModel,
    OpenAIChatModel,
)

from momo_agent.fake_model import FixtureModel

class NoStructuredOutput(Exception):
    """The model finished without calling the structured-output tool."""


def structured(reply, schema, role: str):
    """Turn an agent reply into `schema`; say which role failed when the model gave no structured answer."""
    if reply.structured_output is None:
        raise NoStructuredOutput(f"{role} 模型没有返回结构化结果")
    return schema.model_validate(reply.structured_output)


_REAL = {
    "openai": (OpenAICredential, OpenAIChatModel),
    "anthropic": (AnthropicCredential, AnthropicChatModel),
    "dashscope": (DashScopeCredential, DashScopeChatModel),
}


def make_model(role: str, fixtures: dict[str, list[dict]] | None = None) -> ChatModelBase:
    """Build the model for one agent role; MOMO_LLM_PROVIDER picks fake or a real vendor."""
    provider = os.environ.get("MOMO_LLM_PROVIDER", "fake")
    if provider == "fake":
        return FixtureModel((fixtures or {})[role], role=role)
    if provider not in _REAL:
        raise RuntimeError(f"unknown MOMO_LLM_PROVIDER: {provider}")
    api_key = os.environ.get("MOMO_LLM_API_KEY")
    if not api_key:
        raise RuntimeError("MOMO_LLM_API_KEY is required when MOMO_LLM_PROVIDER is not fake")
    credential_cls, model_cls = _REAL[provider]
    model = os.environ.get("MOMO_LLM_MODEL")
    if not model:
        raise RuntimeError("MOMO_LLM_MODEL is required when MOMO_LLM_PROVIDER is not fake")
    # base_url is optional; DashScope rejects None, so pass it only when set
    base_url = os.environ.get("MOMO_LLM_BASE_URL")
    extra = {"base_url": base_url} if base_url else {}
    credential = credential_cls(api_key=api_key, **extra)
    return model_cls(credential=credential, model=model)
