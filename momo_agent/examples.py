"""Chapter 4's "RAG": no vector store, just pick the existing themes that share the most words."""
from momo_agent.repo import Repo


def pick_examples(repo: Repo, words: list[str], k: int = 2) -> list[dict]:
    """The k themes sharing the most words with `words` (ties by sceneId), story part only."""
    scored = []
    for scene_id in sorted(repo.scene_ids()):
        pack = repo.load_pack(scene_id)
        overlap = len({w["text"] for w in pack.get("words", [])} & set(words))
        scored.append((-overlap, scene_id, pack))
    scored.sort(key=lambda s: s[:2])
    return [
        {
            "sceneId": scene_id,
            "scenes": [
                {
                    "title": s["title"],
                    "translation": s["translation"],
                    "segments": [
                        {"speaker": seg["speaker"], "text": seg["text"]}
                        for seg in s["segments"]
                    ],
                }
                for s in pack["modules"]["story"]
            ],
        }
        for _, scene_id, pack in scored[:k]
    ]
