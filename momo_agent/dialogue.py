"""Chapter 5: the dialogue agent writes 6 practice rounds that follow the story."""
from agentscope.agent import Agent, ReActConfig
from agentscope.message import UserMsg
from pydantic import BaseModel

from momo_agent.story import StoryDraft
from momo_agent.vocab import WordPlan

ROUND_COUNT = 6
MAX_WORDS_PER_REPLY = 8
MAX_WORDS_PER_QUESTION = 15

DIALOGUE_PROMPT = """You write speaking practice for children aged 3 to 6 who are learning English.
Write exactly 6 rounds. In each round Lulu (the bunny) asks the child one question,
and the child picks one of 2 or 3 replies. The rounds should follow the story you are given.
Every round has:
- cn: the question in Chinese, and question: the same question in simple English (at most 15 words).
- replies: 2 or 3 things the child can say. Each reply has text (English, at most 8 words),
  cn (the Chinese meaning), image_word (one of the given words that the reply is about)
  and follow_up (a short English sentence, at most 15 words, that Lulu says back).
Use plain, simple English."""


class Reply(BaseModel):
    text: str
    cn: str
    image_word: str
    follow_up: str


class DialogueRound(BaseModel):
    cn: str
    question: str
    replies: list[Reply]


class DialogueDraft(BaseModel):
    rounds: list[DialogueRound]


def check_dialogue(draft: DialogueDraft, words: list[str]) -> list[str]:
    """Return the problems found; an empty list means the draft is fine."""
    errors = []
    if len(draft.rounds) != ROUND_COUNT:
        errors.append(f"need exactly {ROUND_COUNT} rounds, got {len(draft.rounds)}")
    for i, rnd in enumerate(draft.rounds, 1):
        if not 1 <= len(rnd.question.split()) <= MAX_WORDS_PER_QUESTION:
            errors.append(f"round {i} question: must have 1–15 words")
        if not 2 <= len(rnd.replies) <= 3:
            errors.append(f"round {i}: need 2–3 replies, got {len(rnd.replies)}")
        for j, reply in enumerate(rnd.replies, 1):
            if not 1 <= len(reply.text.split()) <= MAX_WORDS_PER_REPLY:
                errors.append(f"round {i} reply {j}: text must have 1–8 words")
            if not 1 <= len(reply.follow_up.split()) <= MAX_WORDS_PER_QUESTION:
                errors.append(f"round {i} reply {j}: follow_up must have 1–15 words")
            if reply.image_word not in words:
                errors.append(f"round {i} reply {j}: image_word is not a target word: {reply.image_word}")
    return errors


async def write_dialogue(plan: WordPlan, story: StoryDraft, model) -> DialogueDraft:
    words = [card.text for card in plan.words]
    lines = "\n".join(
        f"{i}. {s.narration} Momo: {s.momo_line} Lulu: {s.bunny_line}"
        for i, s in enumerate(story.scenes, 1)
    )
    agent = Agent(
        name="dialogue_writer",
        system_prompt=DIALOGUE_PROMPT,
        model=model,
        react_config=ReActConfig(max_iters=3),
    )
    request = (
        f"Theme: {plan.title}\nGoal: {plan.goal}\nWords: {', '.join(words)}\n"
        f"Story:\n{lines}"
    )
    msg = await agent.reply(UserMsg(name="user", content=request), structured_schema=DialogueDraft)
    return DialogueDraft.model_validate(msg.structured_output)
