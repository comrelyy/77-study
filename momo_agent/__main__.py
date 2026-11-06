"""Command line: python -m momo_agent generate <topic> [--fixtures file] | register"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

from momo_agent.llm import make_model
from momo_agent.pipeline import LessonInvalid, SceneIdConflict, generate_lesson
from momo_agent.register import register
from momo_agent.repo import Repo
from momo_agent.scenes import write_lesson
from momo_agent.validate import validate_pack
from momo_agent.vocab import LessonRefused

ROOT = Path(__file__).resolve().parents[1]


def generate(args, repo: Repo) -> int:
    fixtures = json.loads(Path(args.fixtures).read_text("utf-8")) if args.fixtures else None
    try:
        pack = asyncio.run(generate_lesson(args.topic, repo, lambda role: make_model(role, fixtures)))
    except LessonRefused as err:
        print(f"Not enough illustrated words ({len(err.found)} found, 4 needed). Add these files and try again:")
        for word in err.missing:
            print(f"  static/illustrations/{word}.svg")
        return 2
    except (SceneIdConflict, LessonInvalid) as err:
        print("Lesson not written:")
        for line in getattr(err, "errors", [str(err)]):
            print(f"  {line}")
        return 1
    written = write_lesson(pack, repo)
    static = repo.root / "static"
    manifest = json.loads((static / "audio" / f"s4-{pack['sceneId']}-manifest.json").read_text("utf-8"))
    errors = validate_pack(pack, static, manifest, assume_scene_images=False)
    if errors:
        print("Written, but the final check found problems:")
        for line in errors:
            print(f"  {line}")
        return 1
    register(repo)
    print(f"Wrote {len(written)} files for theme {pack['sceneId']}, for example:")
    print(f"  {written[-1].relative_to(repo.root)}")
    print("Next: preview it with a throwaway database (never data.sqlite3):")
    print("  .venv/bin/python app.py --db /tmp/preview.sqlite3 --port 8766")
    print("Releasing is manual; this tool never does it. When you are happy with the theme:")
    print(f'  1. in static/content/{pack["sceneId"]}.json change "status" to "released"')
    print(f'  2. add "{pack["sceneId"]}" to "releasedScenes" in static/content/catalog.json')
    print("  3. run: node s5-release.cjs   (read the blockers it lists)")
    return 0


def main(argv: list[str] | None = None, root: Path = ROOT) -> int:
    parser = argparse.ArgumentParser(prog="momo_agent")
    sub = parser.add_subparsers(dest="command", required=True)
    gen = sub.add_parser("generate", help="write a new theme from a topic")
    gen.add_argument("topic")
    gen.add_argument("--fixtures", help="fixtures json for the fake model (MOMO_LLM_PROVIDER=fake)")
    sub.add_parser("register", help="list generated themes in the catalog again")
    args = parser.parse_args(argv)
    repo = Repo(root)
    if args.command == "register":
        print("Registered:", ", ".join(register(repo)) or "nothing")
        return 0
    return generate(args, repo)


if __name__ == "__main__":
    sys.exit(main())
