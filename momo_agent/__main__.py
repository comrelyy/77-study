"""Command line: python -m momo_agent generate <topic> [--fixtures file] [--overwrite] | register"""
import argparse
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from momo_agent.llm import NoStructuredOutput, make_model
from momo_agent.pipeline import LessonInvalid, SceneIdConflict, generate_lesson
from momo_agent.register import register
from momo_agent.repo import Repo
from momo_agent.scenes import write_lesson
from momo_agent.vocab import LessonRefused

ROOT = Path(__file__).resolve().parents[1]


def generate(args, repo: Repo) -> int:
    fixtures = json.loads(Path(args.fixtures).read_text("utf-8")) if args.fixtures else None
    if fixtures and os.environ.get("MOMO_LLM_PROVIDER", "fake") != "fake":
        print("Note: --fixtures is only used when MOMO_LLM_PROVIDER is fake.")
    try:
        pack = asyncio.run(generate_lesson(args.topic, repo, lambda role: make_model(role, fixtures), args.overwrite))
        written = write_lesson(pack, repo)
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
    except (NoStructuredOutput, RuntimeError, subprocess.CalledProcessError) as err:
        print(f"Error: {err}")
        return 1
    register(repo)
    print(f"Wrote {len(written)} files for theme {pack['sceneId']}, for example:")
    print(f"  {written[-1].relative_to(repo.root)}")
    print("Next: preview it with a throwaway database (never data.sqlite3):")
    print("  .venv/bin/python app.py --db /tmp/preview.sqlite3 --port 8766")
    print("Careful: in the catalog's development mode a registered draft already shows up in the app's theme list,")
    print("so preview first, and copy static/ to the child's machine only after you have approved the theme.")
    print("Releasing is manual; this tool never does it. When you are happy with the theme:")
    print(f'  1. in static/content/{pack["sceneId"]}.json change "status" to "released"')
    print(f'  2. add "{pack["sceneId"]}" to "releasedScenes" in static/content/catalog.json (this matters for release mode)')
    print("  3. run: node s5-release.cjs   (read the blockers it lists)")
    print("     It rewrites tracked files (reports/s5-release.json, static/dev/s5-manifest.json) and still lists")
    print("     other blockers: audio not yet reviewed, other required themes, device acceptance.")
    print("     Release is a human decision, made after the listening review.")
    return 0


def main(argv: list[str] | None = None, root: Path = ROOT) -> int:
    parser = argparse.ArgumentParser(prog="momo_agent")
    sub = parser.add_subparsers(dest="command", required=True)
    gen = sub.add_parser("generate", help="write a new theme from a topic")
    gen.add_argument("topic")
    gen.add_argument("--fixtures", help="fixtures json for the fake model (MOMO_LLM_PROVIDER=fake)")
    gen.add_argument("--overwrite", action="store_true", help="replace a theme this tool generated before")
    sub.add_parser("register", help="list generated themes in the catalog again")
    args = parser.parse_args(argv)
    repo = Repo(root)
    if args.command == "register":
        print("Registered:", ", ".join(register(repo)) or "nothing")
        return 0
    return generate(args, repo)


if __name__ == "__main__":
    sys.exit(main())
