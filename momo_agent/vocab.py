"""Chapters 2-3: the model proposes words and checks them with tools; the program is the final judge."""
from agentscope.agent import Agent, ReActConfig
from agentscope.message import UserMsg
from pydantic import BaseModel

from momo_agent.llm import structured
from momo_agent.repo import Repo
from momo_agent.tools import make_word_tools

WORD_COUNT = 4

PLANNER_PROMPT = """You plan one tiny English lesson for children aged 3 to 6.
Given a theme, pick 4 or 5 concrete words that a child can see and point at,
such as hat, cup or ball. Avoid abstract words, verbs and long words.
For each word give the English text (lowercase, singular) and its Chinese meaning.
scene_id is a short lowercase English slug (letters, digits, hyphen; e.g. "birthday").
Also give title, goal and function:
title and goal are Chinese; the title looks like "和 Momo 逛公园", the goal is one short sentence.
function is the English sentence pattern the child practises, such as "I can see … / Your turn.".
Use the tools to confirm that each word has a picture (check_word, or list_illustrated_words),
and replace any word that does not with one that does."""


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
    """Split the words into (with illustration, without); exact match only; repeated words count once."""
    have, missing, seen = [], [], set()
    for card in plan.words:
        text = card.text.strip().lower()
        if text in seen:
            continue
        seen.add(text)
        if text in illustrated:
            have.append(WordCard(text=text, cn=card.cn))
        else:
            missing.append(text)
    return have, missing


async def plan_words(topic: str, repo: Repo, model) -> WordPlan:
    agent = Agent(
        name="planner",
        system_prompt=PLANNER_PROMPT,
        model=model,
        toolkit=make_word_tools(repo),
        react_config=ReActConfig(max_iters=6),
    )
    msg = await agent.reply(UserMsg(name="user", content=topic), structured_schema=WordPlan)
    plan = structured(msg, WordPlan, "planner")
    have, missing = check_words(plan, repo.illustrated_words())
    if len(have) < WORD_COUNT:
        raise LessonRefused(missing, [c.text for c in have])
    plan.words = have[:WORD_COUNT]
    return plan
