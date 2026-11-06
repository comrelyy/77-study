"""Read the 77-study repo: which words have illustrations, and which ids words already use."""
import json
from pathlib import Path

NOT_WORDS = {"momo", "bunny", "fox", "turtle", "wave", "scenes"}


class Repo:
    def __init__(self, root: Path):
        self.root = Path(root)

    def illustrated_words(self) -> list[str]:
        names = (p.stem for p in (self.root / "static/illustrations").glob("*.svg"))
        return sorted(n for n in names if n not in NOT_WORDS and "-" not in n)

    def _catalog(self) -> dict:
        return json.loads((self.root / "static/content/catalog.json").read_text("utf-8"))

    def scene_ids(self) -> set[str]:
        return set(self._catalog()["scenes"])

    def load_pack(self, scene_id: str) -> dict:
        path = self.root / "static" / self._catalog()["scenes"][scene_id]
        return json.loads(path.read_text("utf-8"))

    def word_id(self, text: str) -> str:
        for scene_id in sorted(self.scene_ids()):
            for word in self.load_pack(scene_id).get("words", []):
                if word["text"] == text:
                    return word["id"]
        return f"en.{text}.general"
