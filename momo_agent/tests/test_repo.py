import unittest
from pathlib import Path

from momo_agent.repo import Repo

ROOT = Path(__file__).resolve().parents[2]


class RepoTest(unittest.TestCase):
    def setUp(self):
        self.repo = Repo(ROOT)

    def test_illustrated_words(self):
        words = self.repo.illustrated_words()
        self.assertIn("apple", words)
        self.assertIn("umbrella", words)
        for name in ("momo", "bunny", "fox", "turtle", "wave", "scenes", "sock-single"):
            self.assertNotIn(name, words)
        self.assertEqual(words, sorted(words))

    def test_word_id_reuses_existing(self):
        self.assertEqual(self.repo.word_id("tree"), "en.tree.plant")

    def test_word_id_new_word(self):
        self.assertEqual(self.repo.word_id("zzz"), "en.zzz.general")

    def test_scene_ids(self):
        self.assertIn("park", self.repo.scene_ids())

    def test_load_pack(self):
        self.assertEqual(self.repo.load_pack("park")["sceneId"], "park")


if __name__ == "__main__":
    unittest.main()
