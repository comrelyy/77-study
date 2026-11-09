import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from storage_v3 import Storage, ServiceError

ROOT = Path(__file__).resolve().parents[1]


class Clock:
    def __init__(self): self.value = datetime(2026, 10, 29, 10).timestamp()
    def __call__(self): return self.value


class LessonStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.clock = Clock()
        self.s = Storage(Path(self.tmp.name) / 'isolated.sqlite3', ROOT / 'static/content', self.clock)
        self.counter = 0
        data = self.s.begin(dict(owner='owner-a', experienceId='experience-a', recoverOnly=False))
        self.auth = dict(owner='owner-a', token=data['token'])
        self.segment = data['quota']['segmentId']
        self.pack = self.s.packs['park']

    def tearDown(self): self.tmp.cleanup()

    def step(self, kind):
        return next(s for s in self.pack['lesson']['steps'] if s['kind'] == kind)

    def body(self, kind, payload, progress=None):
        self.counter += 1
        payload = dict(payload, theme='park', sceneId='park', contentVersion=self.pack['contentVersion'], moduleId='lesson')
        op = dict(id='lesson-op-%d' % self.counter, kind=kind, payload=payload, experienceId='experience-a',
                  segmentId=self.segment, confirmedAt=self.clock()*1000, confirmationLease=self.auth['token'])
        if progress: op['progress'] = progress
        return dict(self.auth, operation=op)

    def answer(self, step, **fields):
        return self.body('choice', dict(mode='lesson_answer', stepId=step['id'], attempt=1, **fields))

    def progress(self, step, **state):
        base = dict(practiceId='practice-1', stepId=step['id'], attempts=0, revealed=False, matched=[], roundIndex=0, heard=[], fragmentId=None)
        return dict(sceneId='park', moduleId='lesson', contentVersion=self.pack['contentVersion'], state=dict(base, **state))

    def rejected(self, body, code):
        with self.assertRaises(ServiceError) as ctx:
            self.s.submit(body)
        self.assertEqual(ctx.exception.code, code)

    def test_lesson_answer_quiz_correct_and_wrong_saved(self):
        quiz = self.step('quiz')
        wrong = next(o for o in quiz['options'] if o != quiz['answer'])
        first = self.s.submit(self.answer(quiz, selectedId=wrong, correct=False))
        second = self.s.submit(self.answer(quiz, selectedId=quiz['answer'], correct=True))
        self.assertTrue(first['ok'] and second['ok'])
        self.assertTrue(first['stickerGranted'])
        self.assertFalse(second['stickerGranted'])

    def test_lesson_answer_lie_about_correct_rejected(self):
        quiz = self.step('quiz')
        wrong = next(o for o in quiz['options'] if o != quiz['answer'])
        self.rejected(self.answer(quiz, selectedId=wrong, correct=True), 'invalid_lesson_answer')

    def test_match_answer_checks_pair(self):
        match = self.step('match')
        a, b = match['words'][:2]
        self.assertTrue(self.s.submit(self.answer(match, targetId=a, selectedId=a, correct=True))['ok'])
        self.assertTrue(self.s.submit(self.answer(match, targetId=a, selectedId=b, correct=False))['ok'])
        self.rejected(self.answer(match, targetId=a, selectedId=b, correct=True), 'invalid_lesson_answer')

    def test_reply_answer_uses_round(self):
        reply = self.step('reply')
        self.rejected(self.answer(reply, selectedId=reply['rounds'][0]['answer'], correct=True, roundIndex=len(reply['rounds'])), 'invalid_lesson_answer')
        wrong = reply['rounds'][0]['wrong']['id']
        self.assertTrue(self.s.submit(self.answer(reply, selectedId=wrong, correct=False, roundIndex=0))['ok'])

    def test_lesson_progress_roundtrip(self):
        quiz = self.step('quiz')
        progress = self.progress(quiz, attempts=1)
        self.s.submit(self.body('checkpoint', dict(), progress))
        saved = next(p for p in self.s.state()['progress'] if p['moduleId'] == 'lesson')
        self.assertEqual(saved['state'], progress['state'])
        self.assertTrue(saved['compatible'])

    def test_rejects_unknown_lesson_step(self):
        quiz = self.step('quiz')
        progress = self.progress(quiz)
        progress['state']['stepId'] = 'park.lesson.nope'
        self.rejected(self.body('checkpoint', dict(), progress), 'invalid_step')

    def test_old_modules_still_valid(self):
        dialogue = self.pack['modules']['dialogue'][0]
        option = dialogue['options'][0]
        payload = dict(mode='dialogue_reply', stepId=dialogue['id'], selectedId=option['id'], text=option['text'], source='child')
        body = self.body('choice', payload)
        body['operation']['payload']['moduleId'] = 'dialogue'
        self.assertTrue(self.s.submit(body)['ok'])


if __name__ == '__main__':
    unittest.main()
