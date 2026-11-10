import tempfile
import unittest
from pathlib import Path

from app import make_server
from storage_v3 import Storage

ROOT = Path(__file__).resolve().parents[1]


class PreviewResetTests(unittest.TestCase):
    def test_household_state_has_no_preview_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Storage(Path(tmp) / 'a.sqlite3', ROOT / 'static/content')
            self.assertNotIn('previewId', s.state())

    def test_preview_state_carries_per_boot_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'a.sqlite3'
            first = Storage(db, ROOT / 'static/content', preview=True).state()['previewId']
            second = Storage(db, ROOT / 'static/content', preview=True).state()['previewId']
            self.assertTrue(first)
            self.assertNotEqual(first, second)

    def test_preview_server_uses_fresh_temporary_database(self):
        server = make_server(port=0, preview=True)
        try:
            path = server.storage.path
            self.assertNotEqual(path.name, 'data.sqlite3')
            self.assertTrue(server.storage.state()['previewId'])
        finally:
            server.server_close()
        self.assertFalse(path.exists())


if __name__ == '__main__':
    unittest.main()
