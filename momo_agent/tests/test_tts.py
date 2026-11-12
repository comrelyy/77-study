import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

from momo_agent import tts

ROOT = Path(__file__).resolve().parents[2]


def inspect_wav(path: Path) -> dict:
    script = "const {inspectWav}=require('./audio-validation.cjs');" \
             "console.log(JSON.stringify(inspectWav(require('fs').readFileSync(process.argv[1]))))"
    out = subprocess.run(["node", "-e", script, str(path)], cwd=ROOT,
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class FakeKokoro:
    """Stands in for kokoro_onnx.Kokoro: one second of a 24 kHz tone, remembering each call."""

    def __init__(self):
        self.calls = []

    def create(self, text, voice, speed, lang):
        self.calls.append((text, voice, speed, lang))
        return (0.3 * np.sin(np.linspace(0, 2000, 24000))).astype("float32"), 24000


class SynthesizeTest(unittest.TestCase):
    def setUp(self):
        self.engine = FakeKokoro()
        patcher = mock.patch.object(tts, "_kokoro", return_value=self.engine)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_writes_22050_hz_wav_that_passes_the_audio_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "t.wav"
            info = tts.synthesize("Look at my new hat!", "momo", out)
            checked = inspect_wav(out)
        self.assertAlmostEqual(checked["seconds"], 1.0, places=2)
        self.assertEqual(info, {"voice": "Kokoro af_bella", "rate": 1.0, "volume": 100})
        self.assertEqual(self.engine.calls, [("Look at my new hat!", "af_bella", 1.0, "en-us")])

    def test_each_role_has_its_voice_and_single_words_are_slower(self):
        with tempfile.TemporaryDirectory() as tmp:
            for role in ("narrator", "momo", "bunny", "fox", "turtle", "someone"):
                tts.synthesize("I see a hat.", role, Path(tmp) / f"{role}.wav")
            tts.synthesize("hat", "momo", Path(tmp) / "word.wav")
        self.assertEqual([(v, s) for _, v, s, _ in self.engine.calls], [
            ("af_heart", 1.0), ("af_bella", 1.0), ("af_nova", 1.05), ("am_puck", 1.1), ("bm_george", 0.85),
            ("af_bella", 1.0), ("af_bella", 0.9)])


class NarratorAlternatesTest(unittest.TestCase):
    """Narrator: 1st, 3rd... level of a day female, 2nd, 4th... male; other roles never change."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "static/content").mkdir(parents=True)
        (self.root / "static/audio").mkdir()
        (self.root / "static/content/catalog.json").write_text(json.dumps({"days": [
            {"id": "everyday", "route": [{"id": "washing"}, {"id": "dressing"}, {"id": "breakfast"}]}]}), "utf-8")
        (self.root / "content-days").mkdir()
        (self.root / "content-days/zoo.json").write_text(json.dumps({"plan": {"levels": [
            {"scene_id": "zoo-gate"}, {"scene_id": "zoo-lion"}]}}), "utf-8")

    def voices(self, sid):
        asset = {"role": "narrator"}
        return tts.voice_role(asset, sid, self.root / "static"), tts.voice_role({"role": "momo"}, sid, self.root / "static")

    def test_route_and_day_plan_positions(self):
        self.assertEqual([self.voices(s)[0] for s in ("washing", "dressing", "breakfast", "zoo-gate", "zoo-lion", "nowhere")],
                         ["narrator", "narrator-male", "narrator", "narrator", "narrator-male", "narrator"])
        self.assertEqual(self.voices("dressing")[1], "momo")
        self.assertEqual(tts.voice_for("Momo wakes up.", "narrator-male"), ("am_michael", 1.0))

    def test_manifest_keeps_the_narrator_role_with_the_male_voice(self):
        (self.root / "static/audio/s4-dressing-manifest.json").write_text(json.dumps({"entries": []}), "utf-8")
        pack = {"sceneId": "dressing", "contentVersion": "1.0.0", "assets": [
            {"id": "d.n", "kind": "audio", "path": "audio/dressing/n.wav", "text": "Momo gets dressed.",
             "language": "en-US", "role": "narrator"}]}
        roles = []
        with mock.patch.object(tts, "synthesize", lambda t, r, out: roles.append(r) or fake_synth(t, r, out)):
            tts.render_missing_audio(pack, self.root / "static")
        entry = json.loads((self.root / "static/audio/s4-dressing-manifest.json").read_text("utf-8"))["entries"][0]
        self.assertEqual((roles, entry["role"]), (["narrator-male"], "narrator"))


class ModelTest(unittest.TestCase):
    def test_missing_model_names_the_download_script(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(tts, "MODEL_DIR", Path(tmp)), \
                mock.patch.object(tts, "_engine", None):
            self.assertFalse(tts.model_ready())
            with self.assertRaisesRegex(RuntimeError, "download-kokoro.py"):
                tts.synthesize("tree", "momo", Path(tmp) / "t.wav")

    @unittest.skipUnless(tts.model_ready(), "Kokoro model not downloaded (scripts/download-kokoro.py)")
    def test_real_model_writes_a_valid_wav(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "t.wav"
            tts.synthesize("-v Alex hello; rm -rf ~", "fox", out)
            self.assertGreater(inspect_wav(out)["seconds"], 0.5)


def fake_synth(text, role, out):
    Path(out).write_bytes(b"RIFF" + text.encode())
    return {"voice": "V", "rate": 1, "volume": 2}


class RenderAudioTest(unittest.TestCase):
    def test_writes_wavs_and_manifest(self):
        pack = {"sceneId": "park", "contentVersion": "0.1.0", "assets": [
            {"id": "park.tree.audio", "kind": "audio", "path": "audio/park/v0-1-0/park.tree.audio.wav",
             "text": "tree", "role": "momo", "language": "en-US"},
            {"id": "park.tree.image", "kind": "image", "path": "illustrations/tree.svg"},
        ]}
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(tts, "synthesize", fake_synth):
            root = Path(tmp)
            manifest = tts.render_audio(pack, root)
            self.assertEqual(sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()),
                             ["audio/park/v0-1-0/park.tree.audio.wav", "audio/s4-park-manifest.json"])
            self.assertEqual(json.loads((root / "audio/s4-park-manifest.json").read_text()), manifest)
        self.assertEqual(manifest["rightsStatus"], "pending review")
        self.assertIs(manifest["reviewed"], False)
        self.assertIn("Kokoro", manifest["source"])
        e = manifest["entries"][0]
        self.assertEqual(e["sha256"], hashlib.sha256(b"RIFFtree").hexdigest())
        self.assertEqual((e["voice"], e["rate"], e["volume"]), ("V", 1, 2))


class RevoiceAllTest(unittest.TestCase):
    """quiz-audio --all: every file voiced again, except review words (owned elsewhere) and S1 samples."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.static = Path(self.tmp.name)
        audio = self.static / "audio"
        (audio / "a").mkdir(parents=True)
        (audio / "b").mkdir()
        for name in ("a/word.wav", "a/s1.wav", "b/line.wav"):
            (audio / name).write_bytes(b"old")
        old = hashlib.sha256(b"old").hexdigest()

        def entry(i, path):
            return {"id": i, "path": path, "text": "t", "role": "momo", "voice": "Samantha (macOS say)",
                    "rate": 150, "volume": 100, "sha256": old, "provenanceStatus": "mac placeholder"}
        (audio / "s4-a-manifest.json").write_text(json.dumps({"source": "say", "entries": [
            entry("a.word", "audio/a/word.wav"), entry("a.s1", "audio/a/s1.wav")]}), "utf-8")
        # theme b's manifest also lists a's word as a review word, and its own line
        (audio / "s4-b-manifest.json").write_text(json.dumps({"source": "say", "entries": [
            entry("b.lesson.review.word", "audio/a/word.wav"), entry("b.line", "audio/b/line.wav")]}), "utf-8")
        (audio / "s1-sample-manifest.json").write_text(json.dumps({"entries": [{"path": "audio/a/s1.wav"}]}), "utf-8")

    def pack(self, sid, *assets):
        return {"sceneId": sid, "contentVersion": "1.0.0", "assets": [
            {"id": i, "kind": "audio", "path": p, "text": t, "language": "en-US", "role": "momo"} for i, p, t in assets]}

    def manifest(self, sid):
        return {e["id"]: e for e in json.loads((self.static / f"audio/s4-{sid}-manifest.json").read_text("utf-8"))["entries"]}

    def test_revoices_own_files_skips_s1_and_review_and_syncs_shared_entries(self):
        a = self.pack("a", ("a.word", "audio/a/word.wav", "word"), ("a.s1", "audio/a/s1.wav", "apple"))
        b = self.pack("b", ("b.lesson.review.word", "audio/a/word.wav", "word"), ("b.line", "audio/b/line.wav", "a line"))
        with mock.patch.object(tts, "synthesize", fake_synth):
            self.assertEqual(tts.render_missing_audio(b, self.static, everything=True), [self.static / "audio/b/line.wav"])
            self.assertEqual(tts.render_missing_audio(a, self.static, everything=True), [self.static / "audio/a/word.wav"])
        self.assertEqual((self.static / "audio/a/s1.wav").read_bytes(), b"old")
        new_word = hashlib.sha256(b"RIFFword").hexdigest()
        a_entries, b_entries = self.manifest("a"), self.manifest("b")
        self.assertEqual(a_entries["a.word"]["sha256"], new_word)
        self.assertEqual(a_entries["a.s1"]["voice"], "Samantha (macOS say)")
        # b's review entry follows the file a voiced again, and loses the placeholder mark
        self.assertEqual((b_entries["b.lesson.review.word"]["sha256"], b_entries["b.lesson.review.word"]["voice"]), (new_word, "V"))
        self.assertNotIn("provenanceStatus", b_entries["b.lesson.review.word"])
        self.assertNotIn("provenanceStatus", b_entries["b.line"])
        self.assertIn("Kokoro", json.loads((self.static / "audio/s4-b-manifest.json").read_text("utf-8"))["source"])

    def test_assets_sharing_one_file_are_voiced_once(self):
        a = self.pack("a", ("a.word", "audio/a/word.wav", "word"), ("a.word2", "audio/a/word.wav", "word"))
        spoken = []
        with mock.patch.object(tts, "synthesize", lambda t, r, out: spoken.append(t) or fake_synth(t, r, out)):
            tts.render_missing_audio(a, self.static, everything=True)
        self.assertEqual(spoken, ["word"])
        entries = self.manifest("a")
        self.assertEqual(entries["a.word"]["sha256"], entries["a.word2"]["sha256"])

    def test_without_all_existing_files_are_kept(self):
        a = self.pack("a", ("a.word", "audio/a/word.wav", "word"), ("a.new", "audio/a/new.wav", "new"))
        with mock.patch.object(tts, "synthesize", fake_synth):
            self.assertEqual(tts.render_missing_audio(a, self.static), [self.static / "audio/a/new.wav"])
        self.assertEqual((self.static / "audio/a/word.wav").read_bytes(), b"old")


if __name__ == "__main__":
    unittest.main()
