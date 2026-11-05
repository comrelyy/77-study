import sqlite3
import unittest

from app import save_event, add_time


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(':memory:')
        self.c.execute('CREATE TABLE events(id TEXT PRIMARY KEY, day TEXT, kind TEXT, payload TEXT, created REAL)')
        self.c.execute('CREATE TABLE clock(day TEXT PRIMARY KEY, seconds REAL)')

    def tearDown(self):
        self.c.close()

    def test_theme_sticker_is_unique_and_survives_exit(self):
        event = dict(id='first', kind='choice', payload={'theme': 'picnic'})
        save_event(self.c, event, '2026-10-28')
        save_event(self.c, event, '2026-10-29')
        save_event(self.c, dict(id='end', kind='end', payload={'theme': 'picnic'}), '2026-10-29')
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM events').fetchone()[0], 3)
        self.assertEqual(self.c.execute("SELECT id FROM events WHERE kind='sticker'").fetchone()[0], 'sticker-picnic')
        save_event(self.c, dict(id='legacy', kind='introduced'), '2026-10-29')
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM events WHERE kind='sticker'").fetchone()[0], 2)

    def test_invalid_events_are_rejected(self):
        for event in [dict(id='', kind='end'), dict(id='x', kind='bad'),
                      dict(id='x', kind='end', payload=[]),
                      dict(id='x', kind='end', payload={'theme': 'unknown'})]:
            with self.assertRaises(ValueError):
                save_event(self.c, event, '2026-10-28')
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM events').fetchone()[0], 0)

    def test_time_is_bounded_and_invalid_values_do_not_write(self):
        for value in [-1, float('nan'), float('inf')]:
            with self.assertRaises(ValueError):
                add_time(self.c, '2026-10-28', value)
        self.assertEqual(self.c.execute('SELECT COUNT(*) FROM clock').fetchone()[0], 0)
        for _ in range(200):
            add_time(self.c, '2026-10-28', 10)
        self.assertEqual(self.c.execute('SELECT seconds FROM clock').fetchone()[0], 900)
        add_time(self.c, '2026-10-29', 1)
        self.assertEqual(self.c.execute('SELECT seconds FROM clock WHERE day=?', ('2026-10-29',)).fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
