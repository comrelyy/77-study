import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from storage_v3 import Storage, ServiceError

ROOT = Path(__file__).resolve().parents[1]


class Clock:
    def __init__(self): self.value = datetime(2026, 10, 29, 10).timestamp()
    def __call__(self): return self.value


class ClearedTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'isolated.sqlite3'
        self.clock = Clock()
        self.s = Storage(self.db, ROOT / 'static/content', self.clock)
        self.counter = 0
        data = self.s.begin(dict(owner='owner-a', experienceId='experience-a', recoverOnly=False))
        self.auth = dict(owner='owner-a', token=data['token'])
        self.segment = data['quota']['segmentId']

    def tearDown(self): self.tmp.cleanup()

    def cleared(self, scene='park'):
        self.counter += 1
        pack = self.s.packs.get(scene)
        payload = dict(sceneId=scene, moduleId='lesson', contentVersion=pack['contentVersion'] if pack else 'x')
        op = dict(id='cleared-op-%d' % self.counter, kind='cleared', payload=payload, experienceId='experience-a',
                  segmentId=self.segment, confirmedAt=self.clock()*1000, confirmationLease=self.auth['token'])
        return dict(self.auth, operation=op)

    def events(self, s=None):
        return [e for e in (s or self.s).state()['events'] if e['kind'] == 'cleared']

    def test_cleared_is_recorded_once(self):
        first = self.s.submit(self.cleared())
        second = self.s.submit(self.cleared())
        self.assertTrue(first['ok'] and first['cleared'] and second['cleared'])
        events = self.events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['payload']['sceneId'], 'park')

    def test_cleared_same_operation_id_is_stable(self):
        body = self.cleared()
        first = self.s.submit(body)
        again = self.s.submit(body)
        self.assertEqual(first['cleared'], again['cleared'])
        self.assertEqual(len(self.events()), 1)

    def test_cleared_after_quota_cutoff_is_accepted(self):
        with self.s.connect() as c:
            c.execute('UPDATE segments SET used=480,exhausted_at=? WHERE id=?', (self.clock()-1, self.segment))
            c.execute('INSERT OR REPLACE INTO daily_status VALUES(?,?)', (self.s.day(self.clock()), self.clock()-1))
        self.assertTrue(self.s.submit(self.cleared())['ok'])
        self.assertEqual(len(self.events()), 1)

    def test_cleared_rejects_unknown_scene(self):
        with self.assertRaises(ServiceError) as ctx:
            self.s.submit(self.cleared('nowhere'))
        self.assertEqual(ctx.exception.code, 'invalid_content')

    def test_cleared_requires_lease_confirmation(self):
        body = self.cleared()
        body['operation']['confirmationLease'] = 'unknown-lease'
        body['operation']['confirmedAt'] = self.clock()*1000 + 400
        with self.assertRaises(ServiceError) as ctx:
            self.s.submit(body)
        self.assertEqual(ctx.exception.code, 'invalid_confirmation')

    def test_backfill_from_lesson_end_progress(self):
        pack = self.s.packs['park']
        state = dict(practiceId='practice-1', stepId='park.lesson.end', attempts=0, revealed=False, matched=[], roundIndex=0, heard=[], fragmentId=None)
        with self.s.connect() as c:
            c.execute('INSERT INTO progress VALUES(?,?,?,?,1,?)', ('park', 'lesson', pack['contentVersion'], json.dumps(state), self.clock()))
            c.execute('INSERT INTO progress VALUES(?,?,?,?,1,?)', ('picnic', 'lesson', pack['contentVersion'], json.dumps(dict(state, stepId='picnic.lesson.quiz')), self.clock()))
        self.assertEqual(self.events(), [])
        again = Storage(self.db, ROOT / 'static/content', self.clock)
        self.assertEqual([e['payload']['sceneId'] for e in self.events(again)], ['park'])
        again = Storage(self.db, ROOT / 'static/content', self.clock)
        self.assertEqual(len(self.events(again)), 1)


if __name__ == '__main__':
    unittest.main()
