"""Chapters 6-7: run planner -> story -> dialogue, send mistakes back for a rewrite, then assemble and validate."""
import re
from typing import Callable

from agentscope.message import UserMsg

from momo_agent.assemble import assemble_pack
from momo_agent.dialogue import DialogueDraft, check_dialogue, dialogue_agent, dialogue_request
from momo_agent.repo import Repo
from momo_agent.story import StoryDraft, check_story, story_agent, story_request
from momo_agent.validate import validate_pack
from momo_agent.vocab import plan_words

MAX_REWRITES = 2


class SceneIdConflict(Exception):
    pass


class LessonInvalid(Exception):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def check_scene_id(scene_id: str, repo: Repo) -> None:
    """Refuse bad slugs, and refuse to overwrite a theme that this agent did not write."""
    if not re.fullmatch(r"[a-z][a-z0-9-]*", scene_id):
        raise SceneIdConflict(f"invalid scene id: {scene_id!r}")
    if scene_id in repo.scene_ids() and repo.load_pack(scene_id).get("generatedBy") != "momo_agent":
        raise SceneIdConflict(f"scene id already used by an existing theme: {scene_id}")


async def write_checked(agent, request: str, schema, check):
    """Ask the agent; while the check finds problems, tell the same agent and ask again (at most 2 rewrites)."""
    msg = request
    for rewrite in range(MAX_REWRITES + 1):
        reply = await agent.reply(UserMsg(name="user", content=msg), structured_schema=schema)
        draft = schema.model_validate(reply.structured_output)
        errors = check(draft)
        if not errors:
            return draft
        msg = "Your draft has these problems:\n- " + "\n- ".join(errors) + "\nPlease write the corrected full version."
    raise LessonInvalid(errors)


async def generate_lesson(topic: str, repo: Repo, model_for: Callable[[str], object]) -> dict:
    plan = await plan_words(topic, repo, model_for("planner"))
    check_scene_id(plan.scene_id, repo)
    words = [card.text for card in plan.words]
    story = await write_checked(
        story_agent(model_for("story")), story_request(plan, repo), StoryDraft,
        lambda d: check_story(d, words),
    )
    dialogue = await write_checked(
        dialogue_agent(model_for("dialogue")), dialogue_request(plan, story), DialogueDraft,
        lambda d: check_dialogue(d, words),
    )
    pack = assemble_pack(plan, story, dialogue, repo)
    errors = validate_pack(pack, repo.root / "static")
    if errors:
        raise LessonInvalid(errors)
    return pack
