"""Command line: python -m momo_agent generate <topic> [--fixtures file] [--overwrite] | register | eval [--suite file]
  | quiz <id> [--fixtures file] | quiz-approve <id> | quiz-audio <id> | day-plan <topic> [--fixtures file] [--overwrite]
  | day-draw <dayId> [--fixtures file] | day-redraw <dayId> <word> [--note text] [--fixtures file] | day-picture-approve <dayId> <word>
  | day-build <dayId> [--fixtures file] | day-approve <dayId>"""
import argparse
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from momo_agent.dayplan import day_file, load_day, new_day_data, plan_day, save_day
from momo_agent.dayrun import build_day
from momo_agent.evaluate import format_report, run_suite
from momo_agent.guard import Budget, BudgetExceeded, TopicRejected, clean_topic
from momo_agent.memory import MEMORY_FILE, Memory
from momo_agent.llm import NoStructuredOutput, make_model
from momo_agent import dayapprove, pictures, quiz as quiz_mod, tts
from momo_agent.pipeline import LessonInvalid, SceneIdConflict, generate_lesson
from momo_agent.quiz import write_quiz
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
        print(quiz_mod.WINDOWS_AUDIO_HINT.format(args.scene_id))
        return 1
    try:
        written = tts.render_missing_audio(pack, repo.root / "static")
    except RuntimeError as err:
        print(f"Error: {err}")
        return 1
    print(f"Synthesised {len(written)} audio files.")
    return 0


def day_plan_command(args, repo: Repo) -> int:
    fixtures = json.loads(Path(args.fixtures).read_text("utf-8")) if args.fixtures else None
    if fixtures and os.environ.get("MOMO_LLM_PROVIDER", "fake") != "fake":
        print("Note: --fixtures is only used when MOMO_LLM_PROVIDER is fake.")
    budget = Budget.from_env()
    try:
        topic = clean_topic(args.topic)
        plan = asyncio.run(plan_day(topic, repo, make_model("day_planner", fixtures, budget), args.overwrite))
        path = day_file(repo, plan.day_id)
        save_day(repo, new_day_data(plan, topic))
    except BudgetExceeded:
        print("已达到模型费用上限，停止生成，没有写入任何文件。")
        print(budget.summary())
        return 1
    except TopicRejected as err:
        print(f"主题不能用：{err}")
        return 1
    except LessonInvalid as err:
        print("Day plan not written:")
        for line in err.errors:
            print(f"  {line}")
        return 1
    except (NoStructuredOutput, RuntimeError) as err:
        print(f"Error: {err}")
        return 1
    have = set(repo.illustrated_words())
    print(f"{plan.title}（{plan.day_id}）共 {len(plan.levels)} 关：")
    missing = []
    for number, level in enumerate(plan.levels, 1):
        print(f"  {number}. {level.title}（{level.scene_id}，band {level.band}）："
              + " ".join(card.text for card in level.words))
        missing += [card.text for card in level.words if card.text not in have]
    if missing:
        print("缺图的词（下一步要画）：" + "，".join(missing))
    print(budget.summary())
    print(f"已写入 {path.relative_to(repo.root)}")
    return 0


def _load_day_or_say(args, repo: Repo) -> dict | None:
    try:
        return load_day(repo, args.day_id)
    except FileNotFoundError:
        print(f"找不到这一天：{args.day_id}，请先运行：python -m momo_agent day-plan <主题>")
        return None


def _draw_command(args, repo: Repo, work) -> int:
    """Shared by day-draw and day-redraw: run `work(day, model)`, then save the day and take the day's approval back."""
    day = _load_day_or_say(args, repo)
    if day is None:
        return 1
    fixtures = json.loads(Path(args.fixtures).read_text("utf-8")) if args.fixtures else None
    if fixtures and os.environ.get("MOMO_LLM_PROVIDER", "fake") != "fake":
        print("Note: --fixtures is only used when MOMO_LLM_PROVIDER is fake.")
    budget = Budget.from_env()
    try:
        try:
            work(day, make_model("illustrator", fixtures, budget))
        finally:  # pictures drawn before a failure are already on disk, so keep their records
            save_day(repo, day)
            dayapprove.unapprove_day(repo, args.day_id)
    except BudgetExceeded:
        print("已达到模型费用上限，停止生成，已画好的图保留为待审。")
        print(budget.summary())
        return 1
    except LessonInvalid as err:
        print("图没有通过检查：")
        for line in err.errors:
            print(f"  {line}")
        return 1
    except (NoStructuredOutput, RuntimeError) as err:
        print(f"Error: {err}")
        return 1
    print(budget.summary())
    return 0


def day_draw_command(args, repo: Repo) -> int:
    def work(day, model):
        drawn = asyncio.run(pictures.draw_missing(day, repo, model))
        print("新画的词（待审，看过再通过）：" + "，".join(drawn) if drawn else "没有缺图的词。")
    code = _draw_command(args, repo, work)
    if code == 0:
        print(f"逐张看过后运行：python -m momo_agent day-picture-approve {args.day_id} <词>")
    return code


def day_redraw_command(args, repo: Repo) -> int:
    def work(day, model):
        asyncio.run(pictures.redraw(day, args.word, args.note, repo, model))
        print(f"{args.word} 已重画，待审。")
    return _draw_command(args, repo, work)


def day_picture_approve_command(args, repo: Repo) -> int:
    day = _load_day_or_say(args, repo)
    if day is None:
        return 1
    try:
        pictures.approve_picture(day, args.word, repo)
    except RuntimeError as err:
        print(f"Error: {err}")
        return 1
    save_day(repo, day)
    dayapprove.write_snapshot(repo, args.day_id)
    print(f"{args.word} 的图已通过。")
    return 0


def day_build_command(args, repo: Repo) -> int:
    if _load_day_or_say(args, repo) is None:
        return 1
    fixtures = json.loads(Path(args.fixtures).read_text("utf-8")) if args.fixtures else None
    if fixtures and os.environ.get("MOMO_LLM_PROVIDER", "fake") != "fake":
        print("Note: --fixtures is only used when MOMO_LLM_PROVIDER is fake.")
    budget = Budget.from_env()
    try:
        result = build_day(args.day_id, repo, fixtures, budget)
    except BudgetExceeded:
        print("已达到模型费用上限，停止生成。已写好的关和图保留，再运行一次会接着做没做完的关。")
        print(budget.summary())
        return 1
    except LessonRefused as err:
        print("有词还没有图，先运行 day-draw 或改计划：" + "，".join(err.missing))
        return 2
    except (SceneIdConflict, LessonInvalid) as err:
        print("这一天没有生成完：")
        for line in getattr(err, "errors", [str(err)]):
            print(f"  {line}")
        return 1
    except (NoStructuredOutput, RuntimeError, subprocess.CalledProcessError) as err:
        print(f"Error: {err}")
        return 1
    print(budget.summary())
    print("重新生成的关：" + ("，".join(result["regenerated"]) or "没有（计划没变）"))
    if result["drawn"]:
        print("新画的词（待审）：" + "，".join(result["drawn"]))
    if result["removed_pictures"]:
        print("计划不再用、已删掉的待审图：" + "，".join(result["removed_pictures"]))
    print(f"{args.day_id} 已登记为未批准，孩子的地图上还看不到。下一步：")
    print("  1. 用一次性数据库打开审阅页逐关看过（不要用 data.sqlite3）：")
    print("     .venv/bin/python app.py --db /tmp/preview.sqlite3 --port 8766，再打开 /dev/content-review.html")
    print(f"  2. 每张新图看过后：python -m momo_agent day-picture-approve {args.day_id} <词>")
    print("  3. 每关题目看过后：python -m momo_agent quiz-approve <关>")
    print(f"  4. 整天看过后：python -m momo_agent day-approve {args.day_id}")
    return 0


def day_approve_command(args, repo: Repo) -> int:
    try:
        dayapprove.approve_day(repo, args.day_id)
    except FileNotFoundError:
        print(f"找不到这一天：{args.day_id}，请先运行：python -m momo_agent day-plan <主题>")
        return 1
    except RuntimeError as err:
        print(f"还不能批准 {args.day_id}：")
        print(err)
        return 1
    print(f"{args.day_id} 已批准，孩子的地图上能看到了。")
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
    dp = sub.add_parser("day-plan", help="plan a whole day of 5-7 linked levels (writes content-days/<dayId>.json)")
    dp.add_argument("topic")
    dp.add_argument("--fixtures", help="fixtures json for the fake model (MOMO_LLM_PROVIDER=fake)")
    dp.add_argument("--overwrite", action="store_true", help="replace a day plan written before")
    dd = sub.add_parser("day-draw", help="draw the planned words that have no picture yet (pending your review)")
    dd.add_argument("day_id")
    dd.add_argument("--fixtures", help="fixtures json for the fake model (MOMO_LLM_PROVIDER=fake)")
    dr = sub.add_parser("day-redraw", help="draw one of the day's pictures again")
    dr.add_argument("day_id")
    dr.add_argument("word")
    dr.add_argument("--note", help="what to change, in your own words")
    dr.add_argument("--fixtures", help="fixtures json for the fake model (MOMO_LLM_PROVIDER=fake)")
    dpa = sub.add_parser("day-picture-approve", help="approve one drawn picture (a person's decision)")
    dpa.add_argument("day_id")
    dpa.add_argument("word")
    da = sub.add_parser("day-approve", help="put a built day on the child's map (a person's decision)")
    da.add_argument("day_id")

    db = sub.add_parser("day-build", help="generate the planned levels of a day and register it, not approved")
    db.add_argument("day_id")
    db.add_argument("--fixtures", help="fixtures json for the fake model: illustrator, and story/dialogue/quiz per scene id")
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
    if args.command == "day-plan":
        return day_plan_command(args, repo)
    if args.command == "day-draw":
        return day_draw_command(args, repo)
    if args.command == "day-redraw":
        return day_redraw_command(args, repo)
    if args.command == "day-picture-approve":
        return day_picture_approve_command(args, repo)
    if args.command == "day-approve":
        return day_approve_command(args, repo)
    if args.command == "day-build":
        return day_build_command(args, repo)
    if args.command == "quiz-audio":
        return quiz_audio_command(args, repo)
    return generate(args, repo)


if __name__ == "__main__":
    sys.exit(main())
