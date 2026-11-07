"""Chapter 13: remember which themes were generated and which words they used."""
import json
import os
from datetime import date
from pathlib import Path

MEMORY_FILE = "momo_agent/memory.json"


class Memory:
    def __init__(self, path: Path):
        self.path = Path(path)

    def themes(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            return json.loads(self.path.read_text("utf-8"))
        except json.JSONDecodeError as err:
            raise RuntimeError(f"memory file is damaged, fix or delete it: {self.path} ({err})") from err

    def find_topic(self, topic: str) -> dict | None:
        key = topic.strip().lower()
        for theme in self.themes():
            if theme["topic"].strip().lower() == key:
                return theme
        return None

    def used_words(self) -> dict[str, str]:
        """Word -> scene_id of the latest lesson that used it."""
        used = {}
        for theme in self.themes():
            for word in theme["words"]:
                used[word] = theme["scene_id"]
        return used

    def remember(self, topic: str, pack: dict) -> None:
        themes = [t for t in self.themes() if t["scene_id"] != pack["sceneId"]]
        themes.append({
            "topic": topic.strip(),
            "scene_id": pack["sceneId"],
            "words": [w["text"] for w in pack["words"]],
            "date": date.today().isoformat(),
        })
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(themes, ensure_ascii=False, indent=2), "utf-8")
        os.replace(tmp, self.path)
