"""Lesson line: the quiz agent writes comprehension questions and one wrong reply per dialogue round.

The agent only writes content-lesson/<sceneId>.json with reviewed=false; a person approves it by hand."""
import asyncio
import json
import re
import subprocess
from pathlib import Path

from agentscope.agent import Agent, ReActConfig
from pydantic import BaseModel

from momo_agent import tts
from momo_agent.guard import Budget
from momo_agent.llm import make_model
from momo_agent.pipeline import write_checked
from momo_agent.repo import Repo

MAX_QUESTION_CHARS = 30
MAX_REPLY_WORDS = 8
MAX_OPTIONS = 3

QUIZ_PROMPT = """You write quiz questions for a picture-story lesson for children aged 3 to 6 learning English.
You get the 6 scenes, the dialogue rounds (each with a question and the right answer) and the lesson words.
Write two things:
- questions: one multiple-choice question after every second scene (after_scene 2, 4, 6, ...). Write the question in
  simple Chinese, at most 30 characters. options are lesson words only, 3 of them (all of them when the lesson has fewer),
  all different. answer is one of the options and must be a word that appears in the two scenes just before the question.
- replies: for EVERY dialogue round exactly one wrong reply: dialogue_id, text (English, 1 to 8 words, a sentence that fits
  the question but is not the right answer), cn (its Chinese translation), word (a lesson word that appears in text).
  The word must differ from the word shown in the round's right answer, and text must differ from every existing reply.
Use only the lesson words as vocabulary targets."""


class QuizQuestion(BaseModel):
    after_scene: int
    question: str
    options: list[str]
    answer: str


class WrongReply(BaseModel):
    dialogue_id: str
    text: str
    cn: str
    word: str


class QuizDraft(BaseModel):
    questions: list[QuizQuestion]
    replies: list[WrongReply]


def _lesson_words(pack: dict) -> list[dict]:
    by_id = {w["id"]: w for w in pack["words"]}
    return [by_id[i] for i in pack["modules"]["summary"]]


def _has_word(word: str, text: str) -> bool:
    return re.search(rf"\b{re.escape(word)}\b", text, re.IGNORECASE) is not None


def check_quiz(draft: QuizDraft, pack: dict) -> list[str]:
    """Return the problems found; an empty list means the draft is fine."""
    errors = []
    words = [w["text"].lower() for w in _lesson_words(pack)]
    image_word = {w["image"]: w["text"].lower() for w in _lesson_words(pack)}
    scenes = pack["modules"]["story"]
    expected = len(scenes) // 2
    if len(draft.questions) != expected:
        errors.append(f"need exactly {expected} questions, got {len(draft.questions)}")
    for i, q in enumerate(draft.questions, 1):
        if q.after_scene != 2 * i:
            errors.append(f"question {i}: after_scene must be {2 * i}, got {q.after_scene}")
        if not q.question.strip() or len(q.question) > MAX_QUESTION_CHARS:
            errors.append(f"question {i}: question text must be 1-{MAX_QUESTION_CHARS} characters")
        options = [o.lower() for o in q.options]
        if len(set(options)) != len(options) or any(o not in words for o in options):
            errors.append(f"question {i}: options must be distinct lesson words ({', '.join(words)})")
        if len(options) != min(MAX_OPTIONS, len(words)):
            errors.append(f"question {i}: need exactly {min(MAX_OPTIONS, len(words))} options")
        if q.answer.lower() not in options:
            errors.append(f"question {i}: answer {q.answer} is not one of the options")
        shown = [seg["text"] for s in scenes[max(q.after_scene - 2, 0):q.after_scene] for seg in s["segments"]]
        if not any(_has_word(q.answer, text) for text in shown):
            errors.append(f"question {i}: answer {q.answer} must appear in scenes {q.after_scene - 1} and {q.after_scene}")
    dialogues = {d["id"]: d for d in pack["modules"].get("dialogue", [])}
    ids = [r.dialogue_id for r in draft.replies]
    if len(draft.replies) != len(dialogues) or set(ids) != set(dialogues) or len(set(ids)) != len(ids):
        errors.append(f"need exactly {len(dialogues)} replies, one for each dialogue_id: {', '.join(dialogues)}")
    for r in draft.replies:
        if not 1 <= len(r.text.split()) <= MAX_REPLY_WORDS:
            errors.append(f"reply {r.dialogue_id}: text must have 1-{MAX_REPLY_WORDS} words")
        if r.word.lower() not in words or not _has_word(r.word, r.text):
            errors.append(f"reply {r.dialogue_id}: word {r.word} must be a lesson word that appears in text")
        if not r.cn.strip():
            errors.append(f"reply {r.dialogue_id}: cn is empty")
        d = dialogues.get(r.dialogue_id)
        if d:
            if r.word.lower() == image_word.get(d["options"][0]["image"]):
                errors.append(f"reply {r.dialogue_id}: word is the same word as the right answer's picture")
            if r.text.strip().lower() in [o["text"].strip().lower() for o in d["options"]]:
                errors.append(f"reply {r.dialogue_id}: text equals an existing reply")
    return errors


def quiz_agent(model) -> Agent:
    return Agent(
        name="quizmaster",
        system_prompt=QUIZ_PROMPT,
        model=model,
        react_config=ReActConfig(max_iters=3),
    )


def quiz_request(pack: dict) -> str:
    by_image = {w["image"]: w["text"] for w in _lesson_words(pack)}
    scenes = [{"scene": i, "lines": [seg["text"] for seg in s["segments"]]}
              for i, s in enumerate(pack["modules"]["story"], 1)]
    rounds = [{"dialogue_id": d["id"], "question": " ".join(q["text"] for q in d["question"]),
               "right_answer": d["options"][0]["text"], "all_replies": [o["text"] for o in d["options"]],
               "right_answer_word": by_image.get(d["options"][0]["image"])}
              for d in pack["modules"].get("dialogue", [])]
    words = [w["text"] for w in _lesson_words(pack)]
    return (f"Theme: {pack['title']}\nLesson words: {', '.join(words)}\n"
            f"Scenes: {json.dumps(scenes, ensure_ascii=False)}\n"
            f"Dialogue rounds: {json.dumps(rounds, ensure_ascii=False)}")


async def generate_quiz(pack: dict, model, rewrites: dict[str, int] | None = None) -> QuizDraft:
    return await write_checked(quiz_agent(model), quiz_request(pack), QuizDraft,
                               lambda d: check_quiz(d, pack), "quiz", rewrites)


def overlay_path(scene_id: str, repo: Repo) -> Path:
    return repo.root / "content-lesson" / f"{scene_id}.json"


def write_overlay(pack: dict, draft: QuizDraft, repo: Repo) -> Path:
    """Write the overlay lesson-build reads. reviewed is always False here; only approve() sets it."""
    lesson = pack.get("lesson") or {}
    overlay = {
        "sceneId": pack["sceneId"],
        "generatedBy": "momo_agent",
        "reviewed": False,
        "sourceVersion": lesson.get("baseVersion") or pack["contentVersion"],
        "quiz": [{"afterScene": q.after_scene, "question": q.question, "options": q.options, "answer": q.answer}
                 for q in draft.questions],
        "replies": [{"dialogueId": r.dialogue_id, "text": r.text, "cn": r.cn, "word": r.word} for r in draft.replies],
    }
    path = overlay_path(pack["sceneId"], repo)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(overlay, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def run_lesson_build(scene_id: str, repo: Repo) -> str:
    """Merge the overlay into the pack with lesson-build.cjs; return its output, raise RuntimeError on failure."""
    done = subprocess.run(["node", "lesson-build.cjs", scene_id], cwd=repo.root, capture_output=True, text=True)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.strip() or done.stdout.strip())
    return done.stdout


def approve(scene_id: str, repo: Repo) -> None:
    """A person's decision: mark the overlay reviewed and rebuild the pack."""
    path = overlay_path(scene_id, repo)
    overlay = json.loads(path.read_text("utf-8"))
    pack = repo.load_pack(scene_id)
    base = (pack.get("lesson") or {}).get("baseVersion") or pack["contentVersion"]
    if overlay["sourceVersion"] != base:
        raise RuntimeError(f"题目基于旧内容（{overlay['sourceVersion']}，当前 {base}），请先重新生成：python -m momo_agent quiz {scene_id}")
    previous = path.read_text("utf-8")
    overlay["reviewed"] = True
    path.write_text(json.dumps(overlay, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        output = run_lesson_build(scene_id, repo)
        if repo.load_pack(scene_id).get("lesson", {}).get("reviewed") is not True:
            raise RuntimeError("题目没有通过检查，未能审核：\n" + output.strip())
    except BaseException:
        path.write_text(previous, encoding="utf-8")
        raise


def write_quiz(scene_id: str, fixtures: dict | None, budget: Budget, repo: Repo) -> None:
    """Quiz flow shared by `quiz`, `generate` and `day-build`: draft, overlay (unreviewed), lesson build, missing audio."""
    pack = repo.load_pack(scene_id)
    draft = asyncio.run(generate_quiz(pack, make_model("quiz", fixtures, budget)))
    write_overlay(pack, draft, repo)
    print(run_lesson_build(scene_id, repo), end="")
    pack = repo.load_pack(scene_id)
    written = tts.render_missing_audio(pack, repo.root / "static")
    print(f"Synthesised {len(written)} lesson audio files.")
