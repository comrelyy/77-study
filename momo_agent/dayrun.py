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


def _own_levels(day: dict, repo: Repo) -> set[str]:
    """Every level this day has or had: the plan, the recorded keys and the day's route in the catalog."""
    route = {level_id for level_id, owner in repo.day_of_scene().items() if owner == day["dayId"]}
    return {level["scene_id"] for level in day["plan"]["levels"]} | set(day["levels"]) | route


def _words_used_elsewhere(day: dict, repo: Repo) -> set[str]:
    """Words of other days' plans and of every pack that is not one of this day's levels."""
    words = set()
    for plan_file in (repo.root / "content-days").glob("*.json"):
        other = json.loads(plan_file.read_text("utf-8"))
        if other["dayId"] != day["dayId"]:
            words |= {card["text"] for level in other["plan"]["levels"] for card in level["words"]}
    own = _own_levels(day, repo)
    for pack_file in (repo.root / "static/content").glob("*.json"):
        if pack_file.name != "catalog.json" and pack_file.stem not in own:
            words |= {w["text"] for w in json.loads(pack_file.read_text("utf-8")).get("words", [])}
    return words


def _remove_dropped_pictures(day: dict, repo: Repo) -> list[str]:
    """Delete pictures this day drew that are still pending and that the plan no longer uses; approved ones stay.

    A dropped word another day or theme still uses keeps its file; only this day's record of it goes."""
    used = {card["text"] for level in day["plan"]["levels"] for card in level["words"]}
    dropped = [w for w, entry in day["pictures"].items() if entry["status"] == "pending" and w not in used]
    elsewhere = _words_used_elsewhere(day, repo) if dropped else set()
    removed = []
    for word in dropped:
        del day["pictures"][word]
        if word not in elsewhere:
            (repo.root / f"static/illustrations/{word}.svg").unlink(missing_ok=True)
            removed.append(word)
    return removed


def _register_day(day: dict, plan: DayPlan, repo: Repo) -> None:
    """List every level and the day (in plan order) in the catalog; the day is never approved here.

    Levels the plan no longer has leave scenes and developmentScenes (their files stay) and are recorded in
    droppedLevels, so register() never puts them in previewScenes."""
    path = repo.root / "static/content/catalog.json"
    catalog = json.loads(path.read_text("utf-8"))
    planned = [level.scene_id for level in plan.levels]
    old = next((d for d in catalog.get("days", []) if d["id"] == plan.day_id), {"route": []})
    for sid in [r["id"] for r in old["route"]] + list(day["levels"]):
        if sid not in planned:
            catalog["scenes"].pop(sid, None)
            catalog["developmentScenes"] = [s for s in catalog["developmentScenes"] if s != sid]
            day["levels"].pop(sid, None)
            if sid not in day.setdefault("droppedLevels", []):
                day["droppedLevels"].append(sid)
    if "droppedLevels" in day:
        day["droppedLevels"] = [s for s in day["droppedLevels"] if s not in planned]
    for sid in planned:
        catalog["scenes"][sid] = f"content/{sid}.json"
        if sid not in catalog["developmentScenes"]:
            catalog["developmentScenes"].append(sid)
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
    pictures._unapprove_placeholder(repo, day_id)  # off the child's map before any level is touched
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
        _register_day(day, plan, repo)  # before the pictures: load_pack finds a level through the catalog
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
