"""Runs only project tests against temporary/in-memory DBs, never data.sqlite3."""
import hashlib
import io
import json
import platform
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    files = [ROOT/'app.py', ROOT/'storage_v3.py', ROOT/'verify_migration.py', Path(__file__)] + sorted((ROOT/'tests').glob('test_*.py'))
    hashes = {str(file.relative_to(ROOT)).replace('\\','/'): hashlib.sha256(file.read_bytes()).hexdigest() for file in files}
    stream = io.StringIO()
    suite = unittest.defaultTestLoader.discover(str(ROOT/'tests'),pattern='test_*.py')
    result = unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
    output = stream.getvalue()
    report = dict(stage='S3',timestamp=datetime.now(timezone.utc).isoformat(),python=platform.python_version(),
                  status='passed' if result.wasSuccessful() and not result.skipped else 'failed',
                  testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
                  sourceHashes=hashes,isolation='unittest fixtures use temporary files or :memory:; no family DB opened',output=output)
    directory = ROOT/'reports'
    directory.mkdir(exist_ok=True)
    (directory/'s3-python-tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(output)
    print('Report: '+str(directory/'s3-python-tests.json'))
    return 0 if report['status']=='passed' else 1


if __name__=='__main__':sys.exit(main())
