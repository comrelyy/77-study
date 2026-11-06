"""Chapter 6: turn the three drafts into one theme pack, following the shape of static/content/park.json."""
from momo_agent.dialogue import DialogueDraft
from momo_agent.game import GAME_AFTER_DIALOGUE, build_listen_pack
from momo_agent.repo import Repo
from momo_agent.story import StoryDraft
from momo_agent.vocab import WordPlan


def _image(asset_id: str, path: str) -> dict:
    return {"id": asset_id, "kind": "image", "path": path}


def _audio(scene_id: str, asset_id: str, text: str, role: str) -> dict:
    return {
        "id": asset_id, "kind": "audio",
        "path": f"audio/{scene_id}/v0-1-0/{asset_id}.wav",
        "text": text, "language": "en-US", "role": role,
        "source": None, "rights": None, "reviewed": False,
    }


def assemble_pack(plan: WordPlan, story: StoryDraft, dialogue: DialogueDraft, repo: Repo) -> dict:
    sid = plan.scene_id
    word_ids = {card.text: repo.word_id(card.text) for card in plan.words}
    word_image = {card.text: f"{sid}.{card.text}.image" for card in plan.words}
    assets = [
        _image(f"{sid}.momo", "illustrations/momo.svg"),
        _image(f"{sid}.bunny", "illustrations/bunny.svg"),
    ]
    words = []
    for card in plan.words:
        audio_id = f"{sid}.{card.text}.audio"
        assets.append(_image(word_image[card.text], f"illustrations/{card.text}.svg"))
        assets.append(_audio(sid, audio_id, card.text, "momo"))
        words.append({
            "id": word_ids[card.text], "text": card.text, "cn": card.cn,
            "image": word_image[card.text], "audio": audio_id,
        })

    story_scenes = []
    for n, scene in enumerate(story.scenes, 1):
        base = f"{sid}.story.{n}"
        assets.append(_image(f"{base}.image", f"illustrations/scenes/{sid}-{n}.svg"))
        # narration always comes first; momo_first decides who speaks the item line
        item, reply = ("momo", "bunny") if scene.momo_first else ("bunny", "momo")
        lines = [
            ("intro", "narrator", scene.narration),
            ("item", item, scene.momo_line if item == "momo" else scene.bunny_line),
            ("reply", reply, scene.momo_line if reply == "momo" else scene.bunny_line),
        ]
        segments = []
        for part, speaker, text in lines:
            segments.append({
                "id": f"{base}.{part}", "text": text, "speaker": speaker,
                "audio": f"{base}.{part}.audio",
            })
            assets.append(_audio(sid, f"{base}.{part}.audio", text, speaker))
        story_scenes.append({
            "id": base,
            "title": f"{n}. {scene.title}",
            "templateId": "daily-life",
            "illustration": f"{base}.image",
            "characters": [f"{sid}.momo", f"{sid}.bunny"],
            "mainWord": word_ids[scene.main_word],
            "hotspots": [{"word": word_ids[scene.main_word], "x": 0.5, "y": 0.6}],
            "translation": scene.translation,
            "segments": segments,
        })

    rounds = []
    for n, rnd in enumerate(dialogue.rounds, 1):
        base = f"{sid}.dialogue.{n}"
        assets.append(_audio(sid, f"{base}.question.audio", rnd.question, "bunny"))
        options = []
        for k, reply in enumerate(rnd.replies, 1):
            opt = f"{base}.reply.{k}"
            assets.append(_audio(sid, f"{opt}.audio", reply.text, "momo"))
            assets.append(_audio(sid, f"{opt}.follow.audio", reply.follow_up, "bunny"))
            options.append({
                "id": opt, "text": reply.text, "cn": reply.cn,
                "image": word_image[reply.image_word],
                "audio": f"{opt}.audio",
                "followUp": [{"id": f"{opt}.follow", "text": reply.follow_up, "audio": f"{opt}.follow.audio"}],
            })
        rounds.append({
            "id": base, "cn": rnd.cn,
            "question": [{"id": f"{base}.question", "text": rnd.question, "audio": f"{base}.question.audio"}],
            "options": options,
        })

    game = build_listen_pack([card.text for card in plan.words])
    for n, q in enumerate(game["questions"], 1):
        q["id"] = f"{sid}.game.{n}"
        q["target"] = word_ids[q["target"]]
        q["options"] = [word_ids[w] for w in q["options"]]

    return {
        "schemaVersion": 1,
        "sceneId": sid,
        "contentVersion": "0.1.0",
        "status": "draft",
        "compatibleFrom": [],
        "generatedBy": "momo_agent",
        "title": plan.title,
        "stickerId": f"{sid}.sticker",
        "learning": {"goal": plan.goal, "function": plan.function, "revisit": []},
        "assets": assets,
        "words": words,
        "modules": {
            "story": story_scenes,
            "dialogue": rounds,
            "game": game,
            "summary": list(word_ids.values()),
        },
        "interaction": {"gameAfterDialogue": list(GAME_AFTER_DIALOGUE), "separateGameEntry": False},
    }
