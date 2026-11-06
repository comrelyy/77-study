"""Chapter 5: the listen-pack game is built by code, no model involved."""

# the game is offered after these dialogue rounds
GAME_AFTER_DIALOGUE = (2, 4, 5, 6)


def build_listen_pack(words: list[str]) -> dict:
    """One question per word; every question shows all the words as options."""
    return {
        "type": "listen-pack",
        "title": "听清单，把需要的东西找出来",
        "instructions": "先完整听完要找的词，再点对应图片。可以重听、请人示范、跳过或结束。",
        "questions": [{"target": word, "options": list(words)} for word in words],
    }
