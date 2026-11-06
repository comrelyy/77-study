"""Chapter 9: draw the scene pictures and write the lesson (pictures, audio, pack) into static/."""
import json
import re
import shutil
import tempfile
from pathlib import Path

from momo_agent.pipeline import LessonInvalid
from momo_agent.repo import Repo
from momo_agent.tts import render_audio
from momo_agent.validate import validate_pack

# The ground of the park background in draw-content-assets.cjs: grass hill and path.
GROUND = (
    '<path fill="#cbd8b8" d="M0 170q200-75 350 0t250-11v121H0z"/>'
    '<path fill="#e9dfc5" d="M70 280q195-118 471-96l59 38q-293-52-405 58z"/>'
)
WORD_X, WORD_Y, WORD_SIZE = 120, 170, 80


def embed(name: str, x: int, y: int, size: int, repo: Repo) -> str:
    """Put another svg inside the scene: keep its viewBox and inner shapes, give it a new place and size."""
    svg = (repo.root / "static/illustrations" / f"{name}.svg").read_text("utf-8")
    view_box = re.search(r'viewBox="([^"]+)"', svg).group(1)
    body = re.sub(r"^[\s\S]*?<svg\b[^>]*>", "", svg)
    body = re.sub(r"</svg>\s*$", "", body)
    return f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="{view_box}" fill="none">{body}</svg>'


def render_scene(main_word: str, repo: Repo) -> tuple[str, dict]:
    """Return the 600x280 scene picture and the hotspot (centre of the word picture, 0-1)."""
    parts = [
        GROUND,
        '<path d="M16 261q278-9 565 0"/>',
        embed("momo", 215, 130, 125, repo),
        embed("bunny", 330, 127, 125, repo),
        embed(main_word, WORD_X, WORD_Y, WORD_SIZE, repo),
    ]
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 280" fill="none">'
        '<rect x="2" y="2" width="596" height="276" rx="24" fill="#fffaf0"/>'
        '<g stroke="#8b7965" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
        + "".join(parts) + "</g></svg>"
    )
    hotspot = {"x": (WORD_X + WORD_SIZE / 2) / 600, "y": (WORD_Y + WORD_SIZE / 2) / 280}
    return svg, hotspot


def write_lesson(pack: dict, repo: Repo) -> list[Path]:
    """Build the whole lesson in a staging folder, check it there, and only then move it into static/.

    Returns every path written. If anything fails before the move, static/ is left as it was.
    """
    static = repo.root / "static"
    asset_path = {a["id"]: a["path"] for a in pack["assets"]}
    word_text = {w["id"]: w["text"] for w in pack["words"]}
    with tempfile.TemporaryDirectory() as tmp:
        staged = Path(tmp) / "static"
        for scene in pack["modules"]["story"]:
            svg, hotspot = render_scene(word_text[scene["mainWord"]], repo)
            scene["hotspots"] = [{"word": scene["mainWord"], **hotspot}]
            path = staged / asset_path[scene["illustration"]]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(svg, "utf-8")
        manifest = render_audio(pack, staged)
        (staged / "content").mkdir()
        (staged / "content" / f"{pack['sceneId']}.json").write_text(
            json.dumps(pack, indent=2, ensure_ascii=False) + "\n", "utf-8")
        errors = validate_pack(pack, static, manifest, assume_scene_images=False, staged=staged)
        if errors:
            raise LessonInvalid(errors)
        # the new audio folder replaces the old one of this theme
        shutil.rmtree(static / "audio" / pack["sceneId"], ignore_errors=True)
        files = sorted(p for p in staged.rglob("*") if p.is_file())
        files.sort(key=lambda p: (p.suffix == ".json", not p.name.startswith("s4-")))  # pictures and wavs first, pack last
        written = []
        for src in files:
            dest = static / src.relative_to(staged)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(src, dest)
            written.append(dest)
    return written
