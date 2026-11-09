"""Command line: python -m momo_agent generate <topic> [--fixtures file] [--overwrite] | register | eval [--suite file]
  | quiz <id> [--fixtures file] | quiz-approve <id> | quiz-audio <id>"""
import argparse
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from momo_agent.evaluate import format_report, run_suite
from momo_agent.guard import Budget, BudgetExceeded, TopicRejected
from momo_agent.memory import MEMORY_FILE, Memory
from momo_agent.llm import NoStructuredOutput, make_model
from momo_agent import quiz as quiz_mod, tts
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
    memory = Memory(repo.root / MEMORY_FILE)
    try:
        known = memory.find_topic(args.topic)
        if known and not args.overwrite:
            print(f"主题「{args.topic}」已在 {known['date']} 生成为 {known['scene_id']}，要重做请加 --overwrite。")
            return 1
        used = memory.used_words()
        budget = Budget.from_env()
        pack = asyncio.run(generate_lesson(args.topic, repo, lambda role: make_model(role, fixtures, budget),
                                           args.overwrite, used_words=used))
        written = write_lesson(pack, repo)
        memory.remember(args.topic, pack)
    except BudgetExceeded:
        print("已达到模型费用上限，停止生成，没有写入任何文件。")
        print(budget.summary())
        return 1
    except TopicRejected as err:
        print(f"主题不能用：{err}")
        return 1
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
    try:
        write_quiz(pack["sceneId"], fixtures, budget, repo)
    except (BudgetExceeded, LessonInvalid, NoStructuredOutput, RuntimeError, subprocess.CalledProcessError) as err:
        reason = "已达到模型费用上限" if isinstance(err, BudgetExceeded) else "；".join(getattr(err, "errors", [str(err)]))
        print(f"主题 {pack['sceneId']} 已写入。")
        print(f"题目没有生成：{reason}。可以稍后运行 python -m momo_agent quiz {pack['sceneId']}")
        print(budget.summary())
        return 1
    print(budget.summary())
    repeated = [f"{text}（{used[text]}）" for text in sorted(w["text"] for w in pack["words"]) if text in used]
    if repeated:
        print("和以前重复的词：" + "，".join(repeated))
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


WINDOWS_AUDIO_HINT = ("手写主题的题目读音请在 Windows 上运行："
                      "powershell -NoProfile -ExecutionPolicy Bypass -File .\\make-s4-audio.ps1 -SceneId {}")


def write_quiz(scene_id: str, fixtures: dict | None, budget: Budget, repo: Repo) -> None:
    """Quiz flow shared by `quiz` and `generate`: draft, overlay (unreviewed), lesson build, missing audio."""
    pack = repo.load_pack(scene_id)
    draft = asyncio.run(quiz_mod.generate_quiz(pack, make_model("quiz", fixtures, budget)))
    quiz_mod.write_overlay(pack, draft, repo)
    print(quiz_mod.run_lesson_build(scene_id, repo), end="")
    pack = repo.load_pack(scene_id)
    if pack.get("generatedBy") == "momo_agent":
        written = tts.render_missing_audio(pack, repo.root / "static")
        print(f"Synthesised {len(written)} lesson audio files.")
    else:
        print(WINDOWS_AUDIO_HINT.format(scene_id))


def quiz_command(args, repo: Repo) -> int:
    fixtures = json.loads(Path(args.fixtures).read_text("utf-8")) if args.fixtures else None
    if fixtures and os.environ.get("MOMO_LLM_PROVIDER", "fake") != "fake":
        print("Note: --fixtures is only used when MOMO_LLM_PROVIDER is fake.")
    if args.scene_id not in repo.scene_ids():
        print(f"找不到主题：{args.scene_id}")
        return 1
    budget = Budget.from_env()
    try:
        write_quiz(args.scene_id, fixtures, budget, repo)
    except BudgetExceeded:
        print("已达到模型费用上限，停止生成。")
        print(budget.summary())
        return 1
    except LessonInvalid as err:
        print("Quiz not written:")
        for line in err.errors:
            print(f"  {line}")
        return 1
    except (NoStructuredOutput, RuntimeError, subprocess.CalledProcessError) as err:
        print(f"Error: {err}")
        return 1
    print(budget.summary())
    print(f"题目已生成，未审核。预览后运行：python -m momo_agent quiz-approve {args.scene_id}")
    return 0


def quiz_approve_command(args, repo: Repo) -> int:
    try:
        quiz_mod.approve(args.scene_id, repo)
    except (FileNotFoundError, KeyError):
        print(f"找不到 {args.scene_id} 的题目源文件，请先运行：python -m momo_agent quiz {args.scene_id}")
        return 1
    except RuntimeError as err:
        print(f"Error: {err}")
        return 1
    print(f"{args.scene_id} 的题目已审核通过。")
    return 0


def quiz_audio_command(args, repo: Repo) -> int:
    if args.scene_id not in repo.scene_ids():
        print(f"找不到主题：{args.scene_id}")
        return 1
    pack = repo.load_pack(args.scene_id)
    if pack.get("generatedBy") != "momo_agent" and sys.platform != "win32":
        print(WINDOWS_AUDIO_HINT.format(args.scene_id))
        return 1
    written = tts.render_missing_audio(pack, repo.root / "static")
    print(f"Synthesised {len(written)} audio files.")
    return 0


def main(argv: list[str] | None = None, root: Path = ROOT) -> int:
    parser = argparse.ArgumentParser(prog="momo_agent")
    sub = parser.add_subparsers(dest="command", required=True)
    gen = sub.add_parser("generate", help="write a new theme from a topic")
    gen.add_argument("topic")
    gen.add_argument("--fixtures", help="fixtures json for the fake model (MOMO_LLM_PROVIDER=fake)")
    gen.add_argument("--overwrite", action="store_true", help="replace a theme this tool generated before")
    ev = sub.add_parser("eval", help="run every case of a topic suite and print a report")
    ev.add_argument("--suite", default=str(ROOT / "momo_agent/eval/suite.json"))
    qz = sub.add_parser("quiz", help="write the lesson quiz and wrong replies for a theme (unreviewed)")
    qz.add_argument("scene_id")
    qz.add_argument("--fixtures", help="fixtures json for the fake model (MOMO_LLM_PROVIDER=fake)")
    qa = sub.add_parser("quiz-approve", help="mark a theme's quiz as reviewed (a person's decision)")
    qa.add_argument("scene_id")
    qd = sub.add_parser("quiz-audio", help="synthesise missing lesson audio for a theme")
    qd.add_argument("scene_id")
    sub.add_parser("register", help="list generated themes in the catalog again")
    args = parser.parse_args(argv)
    repo = Repo(root)
    if args.command == "register":
        print("Registered:", ", ".join(register(repo)) or "nothing")
        return 0
    if args.command == "eval":
        results = asyncio.run(run_suite(json.loads(Path(args.suite).read_text("utf-8")), repo))
        print(format_report(results))
        return 0 if all(r.passed for r in results) else 1
    if args.command == "quiz":
        return quiz_command(args, repo)
    if args.command == "quiz-approve":
        return quiz_approve_command(args, repo)
    if args.command == "quiz-audio":
        return quiz_audio_command(args, repo)
    return generate(args, repo)


if __name__ == "__main__":
    sys.exit(main())
