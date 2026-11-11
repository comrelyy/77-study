"""Chapter 9: list generated themes in the catalog for preview. Releasing stays a manual step."""
import json

from momo_agent.repo import Repo


def register(repo: Repo) -> list[str]:
    """Add every momo_agent pack to catalog.scenes and previewScenes; never touch release lists.

    Levels of a day (in the catalog or in a day plan not yet built to the end) are skipped: day-build registers them,
    and previewScenes would put them on the map unapproved."""
    catalog_file = repo.root / "static/content/catalog.json"
    catalog = json.loads(catalog_file.read_text("utf-8"))
    in_days = set(repo.day_of_scene())
    for plan_file in (repo.root / "content-days").glob("*.json"):
        in_days |= {level["scene_id"] for level in json.loads(plan_file.read_text("utf-8"))["plan"]["levels"]}
    added = []
    for pack_file in sorted((repo.root / "static/content").glob("*.json")):
        if pack_file.name == "catalog.json":
            continue
        pack = json.loads(pack_file.read_text("utf-8"))
        if pack.get("generatedBy") != "momo_agent":
            continue
        scene_id = pack["sceneId"]
        if scene_id in in_days:
            continue
        catalog["scenes"][scene_id] = f"content/{pack_file.name}"
        if scene_id not in catalog["previewScenes"]:
            catalog["previewScenes"].append(scene_id)
        added.append(scene_id)
    catalog_file.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", "utf-8")
    return added
