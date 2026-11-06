"""Chapter 4: the story agent writes 6 scenes, using similar existing themes as style examples."""
import json
import re

from agentscope.agent import Agent, ReActConfig
from agentscope.message import UserMsg
from pydantic import BaseModel

from momo_agent.examples import pick_examples
from momo_agent.repo import Repo
from momo_agent.vocab import WordPlan

SCENE_COUNT = 6
MAX_WORDS_PER_LINE = 15

STORY_PROMPT = """You write a short picture story for children aged 3 to 6 who are learning English.
Momo is a child and Lulu is a bunny. Write exactly 6 scenes about the given theme.
Use plain, simple English that a learner can read. Each sentence has at most 15 words.
Every scene has:
- title: a short Chinese title, and translation: one Chinese sentence about the scene.
- narration: what happens, then momo_line (Momo speaks) and bunny_line (Lulu replies).
- momo_first: true if Momo speaks before the narration, otherwise false.
- main_word: one of the given words. The child taps it in the picture, so it must be
  something that can be seen in that scene.
Use every given word somewhere in the story, and start every scene with different narration.
Below are stories from other themes. Copy their simple style, not their sentences."""


class StoryScene(BaseModel):
    title: str
    translation: str
    main_word: str
    narration: str
    momo_line: str
    bunny_line: str
    momo_first: bool


class StoryDraft(BaseModel):
    scenes: list[StoryScene]


def check_story(draft: StoryDraft, words: list[str]) -> list[str]:
    """Return the problems found; an empty list means the draft is fine."""
    errors = []
    if len(draft.scenes) != SCENE_COUNT:
        errors.append(f"need exactly {SCENE_COUNT} scenes, got {len(draft.scenes)}")
    texts = []
    for i, scene in enumerate(draft.scenes, 1):
        for name in ("narration", "momo_line", "bunny_line"):
            text = getattr(scene, name)
            texts.append(text)
            if not 1 <= len(text.split()) <= MAX_WORDS_PER_LINE:
                errors.append(f"scene {i} {name}: each line must have 1–15 words")
        if scene.main_word not in words:
            errors.append(f"scene {i} main_word is not a target word: {scene.main_word}")
    story = " ".join(texts)
    for word in words:
        if not re.search(rf"\b{re.escape(word)}\b", story, re.IGNORECASE):
            errors.append(f"target word missing: {word}")
    openings = [s.narration for s in draft.scenes]
    if len(set(openings)) != len(openings):
        errors.append("scene narrations must all be different")
    return errors


async def write_story(plan: WordPlan, repo: Repo, model) -> StoryDraft:
    words = [card.text for card in plan.words]
    examples = pick_examples(repo, words)
    agent = Agent(
        name="storyteller",
        system_prompt=STORY_PROMPT,
        model=model,
        react_config=ReActConfig(max_iters=3),
    )
    request = (
        f"Theme: {plan.title}\nGoal: {plan.goal}\nWords: {', '.join(words)}\n"
        f"Example stories:\n{json.dumps(examples, ensure_ascii=False)}"
    )
    msg = await agent.reply(UserMsg(name="user", content=request), structured_schema=StoryDraft)
    return StoryDraft.model_validate(msg.structured_output)
