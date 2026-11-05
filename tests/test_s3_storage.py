import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime
from pathlib import Path

from storage_v3 import Storage, ServiceError, canonical

ROOT = Path(__file__).resolve().parents[1]


class Clock:
    def __init__(self): self.value = datetime(2026, 10, 29, 10).timestamp()
    def __call__(self): return self.value
    def advance(self, seconds): self.value += seconds


class StorageV3Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.clock = Clock()
        self.db = Path(self.tmp.name) / 'isolated.sqlite3'
        self.s = Storage(self.db, ROOT / 'static/content', self.clock)
        self.counter = 0
        self.begin()

    def tearDown(self): self.tmp.cleanup()

    def begin(self, owner='owner-a', experience='experience-a', recover=False):
        data = self.s.begin(dict(owner=owner, experienceId=experience, recoverOnly=recover))
        self.auth = dict(owner=owner, token=data['token'])
        self.experience, self.segment = experience, data['quota']['segmentId']
        return data

    def op(self, scene='picnic', kind='choice', progress=None):
        self.counter += 1
        pack = self.s.packs[scene]
        choice = pack['modules']['dialogue'][0]['options'][0]
        payload = dict(theme=scene, sceneId=scene, contentVersion=pack['contentVersion'], moduleId='dialogue',
                       mode='dialogue_reply', stepId=pack['modules']['dialogue'][0]['id'], selectedId=choice['id'], text=choice['text'], source='child')
        operation = dict(id='operation-'+str(self.counter), kind=kind, payload=payload, experienceId=self.experience,
                         segmentId=self.segment, confirmedAt=self.clock()*1000, confirmationLease=self.auth['token'])
        if progress: operation['progress'] = progress
        return dict(self.auth, operation=operation)

    def test_development_ignores_old_exhaustion_and_keeps_recording(self):
        with self.s.connect() as c:
            c.execute('INSERT OR REPLACE INTO clock VALUES(?,?)', (self.s.day(self.clock()), 900))
            c.execute('UPDATE segments SET used=480,exhausted_at=? WHERE id=?', (self.clock()-1,self.segment))
            c.execute('INSERT OR REPLACE INTO daily_status VALUES(?,?)', (self.s.day(self.clock()),self.clock()-1))
        self.assertFalse(self.s.state()['quota']['allowed'])
        self.s = Storage(self.db, ROOT / 'static/content', self.clock, limits_enabled=False)
        data = self.begin()
        self.assertTrue(data['quota']['allowed'])
        self.assertFalse(data['quota']['limitsEnabled'])
        _, result = self.tick()
        self.assertEqual(result['deducted'], 5)
        self.assertEqual(result['quota']['dailyUsed'], 905)
        self.assertIsNone(result['reminderId'])
        self.s.submit(self.op())
        self.assertTrue(self.s.state()['events'])
        limited = Storage(self.db, ROOT / 'static/content', self.clock)
        self.assertFalse(limited.state()['quota']['allowed'])

    def test_all_launch_themes_save_distinct_dialogue_and_game_progress(self):
        catalog=json.loads((ROOT/'static/content/catalog.json').read_text(encoding='utf-8'))
        scenes=catalog['previewScenes']
        self.assertEqual(len(scenes),12)
        for scene in scenes:
            with self.subTest(scene=scene):
                self.s.submit(self.op(scene=scene,progress=self.progress(scene)))
                pack=self.s.packs[scene]
                question=pack['modules']['game']['questions'][0]
                game_type=pack['modules']['game']['type']
                selection=question['solution'][-1] if game_type=='story-order' else question['target']
                target=next(w for w in pack['words'] if w['id']==selection)
                body=self.op(scene=scene)
                payload=body['operation']['payload']
                payload.update(moduleId='game',mode={'listen-pack':'packing_game','select-place':'tidy_game','scene-find':'scene_find_game','story-order':'story_order_game'}[game_type],
                               stepId=question['id'],selectedId=target['id'],text=target['text'],targetAudioCompleted=True,
                               attempt=1,matched=True,correct=True,candidateOrder=question['options'],hinted=False,helpTypes=[],zone=question.get('zone'))
                body['operation']['progress']=dict(sceneId=scene,moduleId='game',contentVersion=pack['contentVersion'],
                    state=dict(practiceId='game-'+scene,stepId=question['id'],selectedId=target['id'],order=question['options'],
                               attempts=1,completed=True,demonstrated=False,helpTypes=[]))
                if game_type=='story-order':
                    payload['sequenceOrder']=question['solution']
                    body['operation']['progress']['state']['sequenceOrder']=question['solution']
                self.s.submit(body)
        self.s.release(self.auth)
        self.s=Storage(self.db,ROOT/'static/content',self.clock)
        state=self.s.state()
        self.assertEqual(len(state['progress']),2*len(scenes))
        self.assertEqual({p['sceneId'] for p in state['progress']},set(scenes))
        for scene in scenes:
            events=[e for e in state['events'] if e['payload'].get('sceneId')==scene]
            self.assertTrue(any(e['payload'].get('moduleId')=='dialogue' for e in events))
            self.assertTrue(any(e['payload'].get('moduleId')=='game' for e in events))

    def test_archived_pending_choice_keeps_original_text_without_rewinding_progress(self):
        self.s.submit(self.op(kind='checkpoint',progress=self.progress()))
        before=self.s.state()['progress']
        old=json.loads((ROOT/'static/content/archive/picnic.0.1.0.json').read_text(encoding='utf-8'))
        reply=old['modules']['dialogue'][0]['options'][0]
        body=self.op(progress=self.progress())
        body['operation']['payload'].update(contentVersion='0.1.0',text=reply['text'],selectedId=reply['id'])
        body['operation']['progress']['contentVersion']='0.1.0'
        receipt=self.s.submit(body)
        self.assertTrue(receipt['contentUpdated'])
        self.assertIsNone(receipt['revision'])
        self.assertEqual(self.s.state()['progress'],before)
        self.assertEqual(self.s.submit(body)['id'],receipt['id'])
        saved=[e for e in self.s.state()['events'] if e['id']==body['operation']['id']]
        self.assertEqual(len(saved),1)
        self.assertEqual(saved[0]['payload']['text'],reply['text'])
        self.assertEqual(saved[0]['payload']['contentVersion'],'0.1.0')

    def narrative_game_op(self, scene, sequence=None, heard=True, matched=True):
        body=self.op(scene=scene)
        game=self.s.packs[scene]['modules']['game'];question=game['questions'][0]
        selection=sequence[-1] if sequence else question['target']
        word=next(w for w in self.s.packs[scene]['words'] if w['id']==selection)
        body['operation']['payload'].update(moduleId='game',stepId=question['id'],selectedId=selection,text=word['text'],
            mode={'scene-find':'scene_find_game','story-order':'story_order_game'}[game['type']],
            attempt=1,matched=matched,targetAudioCompleted=heard,candidateOrder=question['options'],hinted=False,helpTypes=[])
        if sequence is not None:body['operation']['payload']['sequenceOrder']=sequence
        return body

    def test_sequence_server_validates_actual_order_and_rejects_forged_success(self):
        solution=self.s.packs['washing']['modules']['game']['questions'][0]['solution']
        wrong=list(reversed(solution))
        self.assert_code('invalid_match',lambda:self.s.submit(self.narrative_game_op('washing',wrong)))
        self.assertEqual(self.s.state()['events'],[])
        bad=self.narrative_game_op('washing',[solution[0]]*3)
        self.assert_code('invalid_sequence',lambda:self.s.submit(bad))
        failed=self.narrative_game_op('washing',wrong,matched=False)
        self.s.submit(failed);self.assertEqual(self.s.submit(failed)['id'],failed['operation']['id'])
        good=self.narrative_game_op('washing',solution);self.s.submit(good)
        choices=[e for e in self.s.state()['events'] if e['kind']=='choice']
        self.assertEqual(len(choices),2);self.assertFalse(choices[0]['payload']['matched']);self.assertTrue(choices[1]['payload']['matched'])

    def test_scene_search_requires_audio_and_refuses_a_disguised_legacy_mode(self):
        self.assert_code('sound_not_completed',lambda:self.s.submit(self.narrative_game_op('park',heard=False)))
        bad=self.narrative_game_op('park');bad['operation']['payload']['mode']='packing_game'
        self.assert_code('invalid_game_mode',lambda:self.s.submit(bad))
        self.assertEqual(self.s.state()['events'],[])
        self.s.submit(self.narrative_game_op('park'))
        self.assertEqual(len([e for e in self.s.state()['events'] if e['kind']=='choice']),1)

    def test_unknown_content_version_remains_rejected(self):
        body=self.op();body['operation']['payload']['contentVersion']='99.0.0'
        self.assert_code('invalid_content',lambda:self.s.submit(body))

    def test_running_service_can_resolve_updated_content_from_disk(self):
        expected_version=self.s.packs['picnic']['contentVersion']
        old=json.loads((ROOT/'static/content/archive/picnic.0.1.0.json').read_text(encoding='utf-8'))
        self.assertNotEqual(expected_version,old['contentVersion'])
        self.s.packs['picnic']=old
        current=self.s.content_pack('picnic',expected_version)
        self.assertEqual(current['contentVersion'],expected_version)
        self.s.submit(self.op(progress=self.progress()))

    def test_running_service_discovers_a_new_theme_and_saves_without_restart(self):
        directory=Path(self.tmp.name)/'new-content'
        directory.mkdir()
        source=ROOT/'static/content'
        (directory/'picnic.json').write_bytes((source/'picnic.json').read_bytes())
        self.s=Storage(self.db,directory,self.clock)
        self.assertNotIn('dressing',self.s.packs)
        incoming=json.loads((source/'dressing.json').read_text(encoding='utf-8'))
        (directory/'dressing.json').write_text(json.dumps(incoming),encoding='utf-8')
        pack=self.s.content_pack('dressing',incoming['contentVersion'])
        self.assertEqual(pack['sceneId'],'dressing')
        self.s.submit(self.op(scene='dressing',progress=self.progress('dressing')))
        self.assertTrue(any(p['sceneId']=='dressing' for p in self.s.state()['progress']))
        (directory/'broken.json').write_text('{',encoding='utf-8')
        self.assertIsNone(self.s.content_pack('broken','0.1.0'))
        self.assertIsNone(self.s.content_pack('../picnic',pack['contentVersion']))

    def test_refresh_handover_rotates_token_without_waiting_or_resetting_data(self):
        self.tick(2);self.s.submit(self.op(progress=self.progress()))
        old_auth=dict(self.auth);before=self.s.state()
        new=self.s.begin(dict(owner='refreshed-page',experienceId=self.experience,previousOwner=old_auth['owner'],resumeToken=old_auth['token']))
        self.assertNotEqual(new['token'],old_auth['token'])
        self.assertEqual(new['quota']['segmentUsed'],2)
        self.assertEqual(new['quota']['segmentId'],before['quota']['segmentId'])
        self.assertEqual(new['events'],before['events']);self.assertEqual(new['progress'],before['progress'])
        self.assert_code('lease_lost',lambda:self.s.heartbeat(old_auth))
        self.s.release(old_auth)
        self.s.heartbeat(dict(owner='refreshed-page',token=new['token']))

    def test_wrong_refresh_proof_does_not_take_another_pages_lease(self):
        for previous,token in [(self.auth['owner'],'wrong-token'),('wrong-owner',self.auth['token'])]:
            with self.assertRaises(ServiceError) as caught:
                self.s.begin(dict(owner='other-page',experienceId='other-experience',previousOwner=previous,resumeToken=token))
            self.assertEqual(caught.exception.code,'other_page_active')
            self.assertGreater(caught.exception.retry_after_ms,0)
            self.s.heartbeat(self.auth)

    def progress(self, scene='picnic'):
        pack = self.s.packs[scene]
        return dict(sceneId=scene, moduleId='dialogue', contentVersion=pack['contentVersion'], state=dict(practiceId='practice-a',
                    stepId=pack['modules']['dialogue'][0]['id'],selectedId=None,confirmed=False,speechIndex=0,history=[]))

    def tick(self, seconds=5, id=None):
        self.counter += 1
        start = self.clock()*1000
        self.clock.advance(seconds)
        body = dict(self.auth, id=id or 'tick-'+str(self.counter), segmentId=self.segment,
                    startedAt=start, endedAt=self.clock()*1000, originToken=self.auth['token'])
        return body, self.s.tick(body)

    def assert_code(self, code, fn):
        with self.assertRaises(ServiceError) as caught: fn()
        self.assertEqual(caught.exception.code, code)

    def test_operation_retry_and_sticker_are_atomic_and_unique(self):
        body = self.op(progress=self.progress())
        first = self.s.submit(body)
        second = self.s.submit(body)
        self.assertEqual(first['id'], second['id'])
        state = self.s.state()
        self.assertEqual(len([e for e in state['events'] if e['kind']=='choice']), 1)
        self.assertEqual(len([e for e in state['events'] if e['kind']=='sticker']), 1)
        self.assertEqual(state['progress'][0]['revision'], 1)

    def test_same_id_different_request_is_rejected(self):
        body = self.op(); self.s.submit(body)
        body['operation']['payload']['text'] = 'changed'
        self.assert_code('id_conflict', lambda: self.s.submit(body))

    def test_invalid_progress_rolls_back_participation_and_sticker(self):
        p = self.progress(); p['state']['stepId'] = 'missing'
        self.assert_code('invalid_step', lambda: self.s.submit(self.op(progress=p)))
        self.assertEqual(self.s.state()['events'], [])
        self.assertEqual(self.s.state()['progress'], [])

    def test_previews_and_incomplete_story_do_not_earn_stickers(self):
        body = self.op(); body['operation']['payload']['mode'] = 'preview'
        self.assert_code('invalid_participation', lambda: self.s.submit(body))
        body = self.op(); step = self.s.packs['picnic']['modules']['story'][0]
        body['operation']['payload'].update(mode='story_listen',moduleId='story',stepId=step['id'],heard=[step['segments'][0]['id']],
            segments=[dict(id=x['id'],text=x['text']) for x in step['segments']])
        self.assert_code('incomplete_story', lambda: self.s.submit(body))
        self.assertEqual(self.s.state()['events'], [])

    def test_tick_retry_cannot_charge_twice_or_accept_changed_interval(self):
        body, result = self.tick(3)
        self.s.tick(body)
        self.assertEqual(self.s.state()['quota']['segmentUsed'], 3)
        body['startedAt'] += 1
        self.assert_code('id_conflict', lambda: self.s.tick(body))

    def test_new_id_for_overlapping_time_is_rejected(self):
        body, result = self.tick(3); body['id']='another-tick'
        self.assert_code('overlapping_interval', lambda: self.s.tick(body))

    def test_ending_and_restarting_experience_does_not_reset_segment(self):
        self.tick(4)
        body=self.op(kind='end');self.s.submit(body)
        self.s.release(self.auth)
        state=self.begin(experience='experience-b')
        self.assertEqual(state['quota']['segmentUsed'],4)
        self.assertEqual(state['quota']['segmentId'],self.segment)

    def test_second_page_blocked_takeover_invalidates_old_token(self):
        old=dict(self.auth)
        self.assert_code('other_page_active',lambda:self.s.begin(dict(owner='owner-b',experienceId='experience-b')))
        self.clock.advance(10.1);self.begin('owner-b','experience-b')
        self.assert_code('lease_lost',lambda:self.s.heartbeat(old))
        self.assert_code('lease_lost',lambda:self.s.submit(dict(old,operation=self.op()['operation'])))

    def test_expired_page_cannot_silently_renew_itself(self):
        self.clock.advance(10.1)
        self.assert_code('lease_lost',lambda:self.s.heartbeat(self.auth))

    def test_midnight_splits_daily_ledger_but_keeps_segment(self):
        self.s.release(self.auth)
        self.clock.value=datetime(2026,10,29,23,59,58).timestamp()
        self.begin(experience='midnight-experience')
        self.tick(3)
        with self.s.connect() as c:
            totals=dict(c.execute('SELECT day,seconds FROM clock').fetchall())
        self.assertEqual(totals['2026-10-29'],2)
        self.assertEqual(totals['2026-10-30'],1)
        self.assertEqual(self.s.state()['quota']['segmentUsed'],3)

    def test_date_rollback_blocks_activity_and_then_recovers_without_reset(self):
        self.tick(2); self.clock.value=datetime(2026,10,28,12).timestamp()
        self.assertTrue(self.s.state()['quota']['dateAnomaly'])
        self.assert_code('date_rollback',lambda:self.s.heartbeat(self.auth))
        self.clock.value=datetime(2026,10,29,12).timestamp();self.begin(experience='restored-date')
        self.assertEqual(self.s.state()['quota']['segmentUsed'],2)

    def test_forward_date_jump_is_recorded_and_does_not_refill_segment(self):
        self.tick(2);self.clock.advance(3*86400)
        state=self.s.state()
        self.assertEqual(state['quota']['segmentUsed'],2)
        self.assertEqual(state['quota']['dailyUsed'],0)
        with self.s.connect() as c:self.assertEqual(c.execute("SELECT COUNT(*) FROM diagnostics WHERE kind='date_jump'").fetchone()[0],1)

    def test_confirmed_choice_can_finish_after_limit_but_new_choice_cannot(self):
        for _ in range(95): self.tick()
        pending=self.op()
        self.tick()
        self.assertFalse(self.s.state()['quota']['allowed'])
        self.assertTrue(self.s.submit(pending)['ok'])
        self.clock.advance(.1)
        self.assert_code('quota_exhausted',lambda:self.s.submit(self.op()))

    def test_pending_recovery_can_acquire_lease_at_limit_without_allowing_activity(self):
        for _ in range(96): self.tick()
        self.s.release(self.auth)
        self.assert_code('quota_exhausted',lambda:self.s.begin(dict(owner='new-page',experienceId='new-experience')))
        state=self.begin('new-page','new-experience',True)
        self.assertFalse(state['quota']['allowed'])

    def test_pin_required_for_new_segment_and_daily_limit_is_not_extended(self):
        self.s.setup_pin({'pin':'1234'})
        self.assert_code('segment_not_exhausted',lambda:self.s.new_segment({'pin':'1234'}))
        for _ in range(96): self.tick()
        old=self.segment
        self.assert_code('auth_failed',lambda:self.s.new_segment({'pin':'9999'}))
        state=self.s.new_segment({'pin':'1234'});self.segment=state['quota']['segmentId']
        self.assertNotEqual(self.segment,old);self.assertEqual(state['quota']['dailyUsed'],480)
        for _ in range(84): self.tick()
        self.assert_code('daily_exhausted',lambda:self.s.new_segment({'pin':'1234'}))

    def test_lower_limits_preserves_used_and_takes_effect_immediately(self):
        self.s.setup_pin({'pin':'1234'})
        for _ in range(13):self.tick()
        state=self.s.lower_limits(dict(pin='1234',segmentSeconds=60,dailySeconds=60))
        self.assertFalse(state['quota']['allowed']);self.assertEqual(state['quota']['dailyUsed'],65)
        self.assert_code('increase_forbidden',lambda:self.s.lower_limits(dict(pin='1234',segmentSeconds=120,dailySeconds=120)))

    def test_recovery_rotates_code_without_clearing_quota_or_history(self):
        code=self.s.setup_pin({'pin':'1234'})['recoveryCode'];self.tick(2);self.s.submit(self.op())
        new=self.s.reset_pin(dict(recoveryCode=code,newPin='5678'))['recoveryCode']
        self.assertNotEqual(new,code)
        self.assert_code('auth_failed',lambda:self.s.reset_pin(dict(recoveryCode=code,newPin='9999')))
        self.assertEqual(self.s.state()['quota']['segmentUsed'],2)
        self.assertEqual(len(self.s.state()['events']),2)
        self.assertNotIn('pin_hash',canonical(self.s.state()))
        with self.s.connect() as c:
            m=c.execute('SELECT * FROM meta').fetchone()
            self.assertNotEqual(m['pin_hash'],b'5678');self.assertNotIn(code,canonical(self.s.state()))

    def test_bad_pin_attempts_are_persisted_and_throttled(self):
        self.s.setup_pin({'pin':'1234'})
        for _ in range(5):self.assert_code('auth_failed',lambda:self.s.lower_limits(dict(pin='9999',segmentSeconds=480,dailySeconds=900)))
        self.assert_code('auth_throttled',lambda:self.s.lower_limits(dict(pin='1234',segmentSeconds=480,dailySeconds=900)))
        self.clock.advance(31)
        self.assertTrue(self.s.lower_limits(dict(pin='1234',segmentSeconds=480,dailySeconds=900))['settings']['pinConfigured'])

    def test_progress_is_per_scene_module_and_incompatible_update_preserves_history(self):
        saved_version = self.s.packs['picnic']['contentVersion']
        self.s.submit(self.op(progress=self.progress()))
        self.s.submit(self.op(scene='tidy',progress=self.progress('tidy')))
        before=self.s.state();self.assertEqual(len(before['progress']),2)
        major,minor,patch=map(int,saved_version.split('.'))
        self.s.packs['picnic']['contentVersion']=f'{major}.{minor}.{patch+1}'
        state=self.s.state();rows={x['sceneId']:x for x in state['progress']}
        self.assertFalse(rows['picnic']['compatible']);self.assertIsNone(rows['picnic']['state']);self.assertTrue(rows['tidy']['compatible'])
        self.assertEqual(len(state['events']),len(before['events']))
        self.s.packs['picnic']['compatibleFrom']=[saved_version]
        self.assertTrue(next(x for x in self.s.state()['progress'] if x['sceneId']=='picnic')['compatible'])

    def test_two_theme_progress_records_and_stickers_survive_restart(self):
        for scene in ('picnic', 'tidy'):
            progress = self.progress(scene)
            progress['state']['practiceId'] = 'practice-' + scene
            self.s.submit(self.op(scene=scene, progress=progress))
        self.s.release(self.auth)
        restarted = Storage(self.db, ROOT / 'static/content', self.clock)
        state = restarted.state()
        rows = {row['sceneId']: row for row in state['progress']}
        self.assertEqual(set(rows), {'picnic', 'tidy'})
        for scene in rows:
            self.assertTrue(rows[scene]['compatible'])
            self.assertEqual(rows[scene]['state']['practiceId'], 'practice-' + scene)
        stickers = [event for event in state['events'] if event['kind'] == 'sticker']
        self.assertEqual({event['payload']['sceneId'] for event in stickers}, {'picnic', 'tidy'})
        choices = [event for event in state['events'] if event['kind'] == 'choice']
        self.assertEqual({event['payload']['sceneId'] for event in choices}, {'picnic', 'tidy'})

    def test_reminder_is_emitted_only_on_first_thirty_second_crossing(self):
        for _ in range(89):self.tick()
        body,result=self.tick()
        self.assertIsNotNone(result['reminderId'])
        _,again=self.tick(1)
        self.assertIsNone(again['reminderId'])
        self.assertEqual(self.s.tick(body)['reminderId'],result['reminderId'])

    def test_legacy_migration_creates_verifiable_backup_and_preserves_rows(self):
        db=Path(self.tmp.name)/'legacy.sqlite3'
        with sqlite3.connect(db) as c:
            c.executescript('CREATE TABLE events(id TEXT PRIMARY KEY,day TEXT,kind TEXT,payload TEXT,created REAL);CREATE TABLE clock(day TEXT PRIMARY KEY,seconds REAL);')
            c.execute('INSERT INTO events VALUES(?,?,?,?,?)',('old-red','2026-10-28','introduced','{}',1))
            c.execute('INSERT INTO clock VALUES(?,?)',('2026-10-29',70))
        c.close()
        from verify_migration import inspect_migration
        probe=inspect_migration(db)
        self.assertEqual(probe['status'],'passed')
        self.assertEqual(probe['oldVersion'],0)
        with sqlite3.connect(db) as original:self.assertEqual(original.execute('PRAGMA user_version').fetchone()[0],0)
        original.close()
        connections=[]
        real_connect=sqlite3.connect
        class TrackedConnection(sqlite3.Connection):
            explicitly_closed=False
            def close(self):
                self.explicitly_closed=True
                super().close()
        def tracking_connect(*args,**kwargs):
            connection=real_connect(*args,factory=TrackedConnection,**kwargs)
            connections.append(connection)
            return connection
        with patch('storage_v3.sqlite3.connect',side_effect=tracking_connect):
            migrated=Storage(db,ROOT/'static/content',self.clock)
        self.assertGreaterEqual(len(connections),2)
        self.assertTrue(all(c.explicitly_closed for c in connections), 'migration must explicitly close both source and backup connections')
        self.assertTrue(Path(migrated.backup_path).exists())
        with sqlite3.connect(migrated.backup_path) as c:self.assertEqual(c.execute('PRAGMA user_version').fetchone()[0],0);self.assertEqual(c.execute('SELECT COUNT(*) FROM events').fetchone()[0],1)
        c.close()
        state=migrated.state();self.assertEqual(state['quota']['dailyUsed'],70);self.assertEqual(state['quota']['segmentUsed'],70)
        self.assertEqual(state['events'][0]['payload'],{})
        self.assertIsNone(Storage(db,ROOT/'static/content',self.clock).backup_path)

    def test_old_checkpoint_cannot_overwrite_newer_progress_but_fact_survives(self):
        p=self.progress();p['expectedRevision']=0
        self.s.submit(self.op(progress=p))
        old=self.op(progress=p)
        result=self.s.submit(old)
        self.assertTrue(result['progressConflict'])
        self.assertEqual(self.s.state()['progress'][0]['revision'],1)
        checkpoint=self.op(progress=p);checkpoint['operation']['kind']='checkpoint'
        self.assert_code('progress_conflict',lambda:self.s.submit(checkpoint))


if __name__=='__main__':unittest.main()
