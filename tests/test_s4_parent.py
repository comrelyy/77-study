import json
import tempfile
import unittest
from pathlib import Path
from storage_v3 import Storage, ServiceError


class ParentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.s = Storage(Path(self.tmp.name)/'test.sqlite3', Path(__file__).resolve().parents[1]/'static/content')
        self.code = self.s.setup_pin({'pin':'1234'})['recoveryCode']

    def tearDown(self):
        self.tmp.cleanup()

    def test_export_requires_pin_and_excludes_secrets(self):
        with self.assertRaises(ServiceError):
            self.s.export_data({'pin':'9999'})
        data = self.s.export_data({'pin':'1234'})
        self.assertEqual(set(data['data']), {'events','clock','segments','experiences','progress','ledger'})
        self.assertNotIn(self.code, json.dumps(data))

    def test_clear_requires_both_confirmations_and_invalidates_old_page(self):
        old = self.s.begin({'owner':'test-page','experienceId':'test-experience'})
        with self.assertRaises(ServiceError):
            self.s.clear_data({'pin':'1234'})
        with self.assertRaises(ServiceError):
            self.s.clear_data({'pin':'9999','confirmation':'清除全部记录'})
        self.s.clear_data({'pin':'1234','confirmation':'清除全部记录'})
        self.assertEqual(self.s.state()['events'], [])
        self.assertTrue(self.s.state()['settings']['pinConfigured'])
        with self.assertRaises(ServiceError):
            self.s.heartbeat({'owner':'test-page','token':old['token']})
