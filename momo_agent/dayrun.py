"""Turn a saved day plan into lessons, level by level; a re-run regenerates only the levels whose plan changed.

The day goes into the catalog as not approved: only a person approves a day."""
import asyncio
import hashlib
import json

from momo_agent import pictures
from momo_agent.dayplan import DayLevel, DayPlan, check_day_plan, load_day, save_day
from momo_agent.guard import Budget
from momo_agent.llm import make_model
from momo_agent.pipeline import LessonInvalid, generate_from_plan
from momo_agent.quiz import run_lesson_build, write_quiz
from momo_agent.repo import Repo
from momo_agent.scenes import refresh_scene_images, write_lesson
from momo_agent.vocab import WordPlan


def level_context(plan: DayPlan, i: int) -> str:
    """What the story and dialogue writers should know about the day around level i (0-based)."""
    levels = plan.levels
    before = levels[i - 1].title if i > 0 else "none, this level opens the day"
    after = levels[i + 1].title if i + 1 < len(levels) else "none, this level closes the day"
    return (f"Day: {plan.title}\nThis is level {i + 1} of {len(levels)}: {levels[i].title}\n"
            f"Previous level: {before}\nNext level: {after}")


def level_key(level: DayLevel) -> str:
    """Fingerprint of a planned level: when it changes, the level is generated again."""
    canonical = json.dumps(level.model_dump(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _remove_dropped_pictures(day: dict, repo: Repo) -> list[str]:
    """Delete pictures this day drew that are still pending and that the plan no longer uses; approved ones stay."""
    used = {card["text"] for level in day["plan"]["levels"] for card in level["words"]}
    removed = []
    for word, entry in list(day["pictures"].items()):
        if entry["status"] == "pending" and word not in used:
            (repo.root / f"static/illustrations/{word}.svg").unlink(missing_ok=True)
            del day["pictures"][word]
            removed.append(word)
    return removed


def _register_day(plan: DayPlan, repo: Repo) -> None:
    """List every level and the day (in plan order) in the catalog; the day is never approved here."""
    path = repo.root / "static/content/catalog.json"
    catalog = json.loads(path.read_text("utf-8"))
    for level in plan.levels:
        catalog["scenes"][level.scene_id] = f"content/{level.scene_id}.json"
        if level.scene_id not in catalog["developmentScenes"]:
            catalog["developmentScenes"].append(level.scene_id)
    entry = {"id": plan.day_id, "title": plan.title, "approved": False,
             "route": [{"id": lv.scene_id, "band": lv.band, "icon": lv.words[0].text} for lv in plan.levels]}
    days = catalog.setdefault("days", [])
    at = next((n for n, d in enumerate(days) if d["id"] == plan.day_id), None)
    if at is None:
        days.append(entry)
    else:
        days[at] = entry
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", "utf-8")


def build_day(day_id: str, repo: Repo, fixtures: dict | None, budget: Budget) -> dict:
    """Draw, generate, refresh, register and build the lessons of one planned day.

    Synchronous on purpose: write_quiz runs its own event loop. With the fake model, `fixtures` holds
    "illustrator" and one {story, dialogue, quiz} entry per scene id. A level's key is saved only once its
    quiz is written, so a run that stops halfway generates the unfinished levels again next time."""
    day = load_day(repo, day_id)
    plan = DayPlan.model_validate(day["plan"])
    errors = check_day_plan(plan, repo, overwrite=True)  # the plan may have been edited by hand since day-plan
    if errors:
        raise LessonInvalid(errors)
    regenerated = []
    try:
        drawn = asyncio.run(pictures.draw_missing(day, repo, make_model("illustrator", fixtures, budget)))
        removed = _remove_dropped_pictures(day, repo)
        for i, level in enumerate(plan.levels):
            sid = level.scene_id
            pack_file = repo.root / "static/content" / f"{sid}.json"
            if day["levels"].get(sid, {}).get("key") == level_key(level) and pack_file.exists():
                continue
            level_fixtures = (fixtures or {}).get(sid)
            words = WordPlan(scene_id=sid, title=level.title, goal=level.goal, function=level.function,
                             words=level.words)
            pack = asyncio.run(generate_from_plan(words, repo, lambda role: make_model(role, level_fixtures, budget),
                                                  overwrite=True, context=level_context(plan, i)))
            write_lesson(pack, repo)
            day["levels"].pop(sid, None)
            regenerated.append(sid)
        _register_day(plan, repo)  # before the pictures: load_pack finds a level through the catalog
        for level in plan.levels:
            refresh_scene_images(level.scene_id, repo)
        for level in plan.levels:  # every level: a neighbour's change can move its bridge and review words
            sid = level.scene_id
            if sid in regenerated:
                write_quiz(sid, (fixtures or {}).get(sid), budget, repo)
                day["levels"][sid] = {"key": level_key(level)}
                save_day(repo, day)
            else:
                print(run_lesson_build(sid, repo), end="")
    finally:  # pictures and finished levels are on disk even after a failure, so keep their records
        save_day(repo, day)
        pictures._unapprove_placeholder(repo, day_id)
    return {"regenerated": regenerated, "drawn": drawn, "removed_pictures": removed}
