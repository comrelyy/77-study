"""Chapter 6: run planner -> story -> dialogue in order, then assemble the pack."""
import re
from typing import Callable

from momo_agent.assemble import assemble_pack
from momo_agent.dialogue import write_dialogue
from momo_agent.repo import Repo
from momo_agent.story import write_story
from momo_agent.vocab import plan_words


class SceneIdConflict(Exception):
    pass


def check_scene_id(scene_id: str, repo: Repo) -> None:
    """Refuse bad slugs, and refuse to overwrite a theme that this agent did not write."""
    if not re.fullmatch(r"[a-z][a-z0-9-]*", scene_id):
        raise SceneIdConflict(f"invalid scene id: {scene_id!r}")
    if scene_id in repo.scene_ids() and repo.load_pack(scene_id).get("generatedBy") != "momo_agent":
        raise SceneIdConflict(f"scene id already used by an existing theme: {scene_id}")


async def generate_lesson(topic: str, repo: Repo, model_for: Callable[[str], object]) -> dict:
    plan = await plan_words(topic, repo, model_for("planner"))
    check_scene_id(plan.scene_id, repo)
    story = await write_story(plan, repo, model_for("story"))
    dialogue = await write_dialogue(plan, story, model_for("dialogue"))
    return assemble_pack(plan, story, dialogue, repo)
