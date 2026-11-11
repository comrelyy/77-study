"""The approval gate of a generated day: a person approves it, every regeneration takes the approval back.

The child's machine runs the catalog in development mode, so the gate is the `approved` flag of the day in
catalog.json. A snapshot per day (static/dev/days/<dayId>.json) feeds the dev review page."""
import hashlib
import json
from pathlib import Path

from momo_agent.dayplan import DayPlan, day_file, load_day
from momo_agent.repo import Repo

SNAPSHOT_DIR = "static/dev/days"


def _catalog_path(repo: Repo) -> Path:
    return repo.root / "static/content/catalog.json"


def _set_approved(repo: Repo, day_id: str, approved: bool) -> None:
    """Flip the flag of a registered day; nothing to do while the day is not registered."""
    path = _catalog_path(repo)
    catalog = json.loads(path.read_text("utf-8"))
    for entry in catalog.get("days", []):
        if entry["id"] == day_id and entry.get("approved") is not approved:
            entry["approved"] = approved
            path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", "utf-8")


def _entry(repo: Repo, day_id: str) -> dict | None:
    return next((d for d in json.loads(_catalog_path(repo).read_text("utf-8")).get("days", []) if d["id"] == day_id), None)


def write_snapshot(repo: Repo, day_id: str) -> Path:
    """Write what the review page shows about this day: its levels in plan order, its pictures and the flag."""
    day = load_day(repo, day_id)
    entry = _entry(repo, day_id)
    snapshot = {"dayId": day_id, "title": day["title"], "approved": bool(entry and entry.get("approved") is True),
                "levels": [{"sceneId": lv["scene_id"], "title": lv["title"], "band": lv["band"],
                            "words": [c["text"] for c in lv["words"]],
                            "bridge": {"text": lv["bridge_en"], "cn": lv["bridge_cn"]}} for lv in day["plan"]["levels"]],
                "pictures": {w: {"status": p["status"], "path": f"illustrations/{w}.svg"} for w, p in day["pictures"].items()}}
    path = repo.root / SNAPSHOT_DIR / f"{day_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", "utf-8")
    return path


def unapprove_day(repo: Repo, day_id: str) -> None:
    """Take the day off the child's map and refresh its snapshot. Every regeneration calls this."""
    _set_approved(repo, day_id, False)
    if day_file(repo, day_id).exists():  # a day that was never planned has nothing to show
        write_snapshot(repo, day_id)


def approval_problems(repo: Repo, day_id: str) -> list[str]:
    from momo_agent.dayrun import level_key  # dayrun imports this module
    day = load_day(repo, day_id)
    plan = DayPlan.model_validate(day["plan"])
    problems = []
    for word, entry in day["pictures"].items():
        file = repo.root / f"static/illustrations/{word}.svg"
        if entry["status"] != "approved":
            problems.append(f"图「{word}」还没通过：python -m momo_agent day-picture-approve {day_id} {word}")
        elif not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest() != entry["sha256"]:
            problems.append(f"图「{word}」通过后又改动了（sha 不符），请重新看过再通过")
    route = {r["id"] for r in (_entry(repo, day_id) or {"route": []})["route"]}
    for level in plan.levels:
        sid = level.scene_id
        if sid not in route:
            problems.append(f"关「{level.title}」（{sid}）还没有生成进目录，先运行 day-build")
            continue
        pack_file = repo.root / "static/content" / f"{sid}.json"
        if not pack_file.exists():
            problems.append(f"关「{level.title}」（{sid}）的内容包不存在，先运行 day-build")
        elif day["levels"].get(sid, {}).get("key") != level_key(level):
            problems.append(f"关「{level.title}」（{sid}）和现在的计划不一致，先运行 day-build")
        elif json.loads(pack_file.read_text("utf-8")).get("lesson", {}).get("reviewed") is not True:
            problems.append(f"关「{level.title}」（{sid}）的题目还没审核：python -m momo_agent quiz-approve {sid}")
    return problems


def approve_day(repo: Repo, day_id: str) -> None:
    """A person's decision: put the day on the child's map, only when every picture and level is approved."""
    if day_id == "everyday":
        raise RuntimeError("第 1 天不走这个闸门")
    problems = approval_problems(repo, day_id)
    if problems:
        raise RuntimeError("\n".join(problems))
    _set_approved(repo, day_id, True)
    write_snapshot(repo, day_id)
