import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from app import make_server


class HttpV3Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.server=make_server(Path(self.tmp.name)/'http-isolated.sqlite3',0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.base='http://127.0.0.1:'+str(self.server.server_address[1])

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()

    def request(self,path,body=None,headers=None):
        data=json.dumps(body).encode() if body is not None else None
        h={'Content-Type':'application/json'} if data else {}
        h.update(headers or {})
        try:
            with urlopen(Request(self.base+path,data=data,headers=h),timeout=5) as response:
                return response.status,json.load(response)
        except HTTPError as error:
            return error.code,json.load(error)

    def test_version_state_and_static_module_are_served(self):
        code,data=self.request('/api/v3/state')
        self.assertEqual(code,200);self.assertEqual(data['schemaVersion'],3)
        self.assertNotIn('pin_hash',json.dumps(data))
        code,version=self.request('/api/v3/version')
        self.assertEqual(code,200);self.assertTrue(version['capabilities']['leaseHandover'])
        with urlopen(self.base+'/main.mjs') as response:
            self.assertEqual(response.status,200)
            self.assertIn('javascript',response.headers.get_content_type())

    def test_old_writes_are_disabled_without_erasing_legacy_read_route(self):
        code,data=self.request('/api/event',{'id':'old','kind':'choice','payload':{'theme':'picnic'}})
        self.assertEqual(code,409);self.assertEqual(data['code'],'upgrade_required')
        self.assertEqual(self.request('/api/state')[1]['events'],[])

    def test_cross_origin_and_plain_form_posts_are_rejected(self):
        code,data=self.request('/api/v3/pin/setup',{'pin':'1234'},{'Origin':'https://untrusted.invalid'})
        self.assertEqual(code,403)
        code,data=self.request('/api/v3/pin/setup',{'pin':'1234'},{'Content-Type':'text/plain'})
        self.assertEqual(code,415)
        self.assertFalse(self.request('/api/v3/state')[1]['settings']['pinConfigured'])

    def test_child_enter_and_release_are_exclusive(self):
        code,data=self.request('/api/v3/enter',{'owner':'page-a','experienceId':'experience-a'})
        self.assertEqual(code,200)
        second=self.request('/api/v3/enter',{'owner':'page-b','experienceId':'experience-b'})
        self.assertEqual(second[0],409)
        self.request('/api/v3/release',{'owner':'page-a','token':data['token']})
        self.assertEqual(self.request('/api/v3/enter',{'owner':'page-b','experienceId':'experience-b'})[0],200)

    def test_new_game_modes_save_and_resume_through_the_real_http_routes(self):
        code,state=self.request('/api/v3/enter',{'owner':'game-page','experienceId':'game-experience'})
        self.assertEqual(code,200)
        for scene in ('washing','park'):
            pack=self.server.storage.packs[scene];game=pack['modules']['game'];q=game['questions'][0]
            sequence=q.get('solution');selected=sequence[-1] if sequence else q['target']
            word=next(w for w in pack['words'] if w['id']==selected)
            payload=dict(sceneId=scene,theme=scene,contentVersion=pack['contentVersion'],moduleId='game',
                         mode='story_order_game' if sequence else 'scene_find_game',stepId=q['id'],selectedId=selected,
                         text=word['text'],source='child',attempt=1,matched=True,hinted=False,targetAudioCompleted=True,
                         candidateOrder=q['options'],helpTypes=[])
            progress=dict(sceneId=scene,moduleId='game',contentVersion=pack['contentVersion'],state=dict(
                practiceId='practice-'+scene,stepId=q['id'],selectedId=selected,order=q['options'],attempts=1,completed=True))
            if sequence:
                payload['sequenceOrder']=sequence;progress['state']['sequenceOrder']=sequence
            operation=dict(id='http-'+scene,kind='choice',payload=payload,progress=progress,
                experienceId='game-experience',segmentId=state['quota']['segmentId'],confirmedAt=time.time()*1000,confirmationLease=state['token'])
            body=dict(owner='game-page',token=state['token'],operation=operation)
            self.assertEqual(self.request('/api/v3/operation',body)[0],200)
            self.assertEqual(self.request('/api/v3/operation',body)[0],200)
        code,saved=self.request('/api/v3/state')
        self.assertEqual(code,200)
        choices=[e for e in saved['events'] if e['kind']=='choice']
        self.assertEqual(len(choices),2)
        self.assertEqual({p['sceneId'] for p in saved['progress']},{'washing','park'})


if __name__=='__main__':unittest.main()
