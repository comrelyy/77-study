"""Chapter 2: the model proposes words (structured output); the program checks the illustrations."""
from agentscope.agent import Agent
from agentscope.message import UserMsg
from pydantic import BaseModel

from momo_agent.repo import Repo

WORD_COUNT = 4

PLANNER_PROMPT = """You plan one tiny English lesson for children aged 3 to 6.
Given a theme, pick 4 or 5 concrete words that a child can see and point at,
such as hat, cup or ball. Avoid abstract words, verbs and long words.
For each word give the English text (lowercase, singular) and its Chinese meaning.
Also give a short scene_id, a title, a one-sentence goal and a function."""


class WordCard(BaseModel):
    text: str
    cn: str


class WordPlan(BaseModel):
    scene_id: str
    title: str
    goal: str
    function: str
    words: list[WordCard]


class LessonRefused(Exception):
    def __init__(self, missing: list[str], found: list[str]):
        super().__init__(f"not enough illustrated words; missing illustrations: {missing}")
        self.missing = missing
        self.found = found


def check_words(plan: WordPlan, illustrated: list[str]) -> tuple[list[WordCard], list[str]]:
    """Split the words into (with illustration, without); exact match only."""
    have, missing = [], []
    for card in plan.words:
        text = card.text.strip().lower()
        if text in illustrated:
            have.append(WordCard(text=text, cn=card.cn))
        else:
            missing.append(text)
    return have, missing


async def plan_words(topic: str, repo: Repo, model) -> WordPlan:
    agent = Agent(name="planner", system_prompt=PLANNER_PROMPT, model=model)
    msg = await agent.reply(UserMsg(name="user", content=topic), structured_schema=WordPlan)
    plan = WordPlan.model_validate(msg.structured_output)
    have, missing = check_words(plan, repo.illustrated_words())
    if len(have) < WORD_COUNT:
        raise LessonRefused(missing, [c.text for c in have])
    plan.words = have[:WORD_COUNT]
    return plan
