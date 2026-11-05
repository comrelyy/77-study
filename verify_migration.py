"""Validate migration using a read-only source snapshot and a disposable copy."""
import hashlib
import json
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from contextlib import closing

from storage_v3 import Storage, VERSION

ROOT=Path(__file__).resolve().parent


def legacy_digest(connection):
    tables={r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    result={}
    for table,order in [('events','id'),('clock','day')]:
        rows=connection.execute('SELECT * FROM '+table+' ORDER BY '+order).fetchall() if table in tables else []
        encoded=json.dumps([list(row) for row in rows],ensure_ascii=False,default=str,separators=(',',':')).encode()
        result[table]=dict(count=len(rows),sha256=hashlib.sha256(encoded).hexdigest())
    return result


def inspect_migration(source):
    source=Path(source).resolve()
    if not source.exists():
        return dict(status='passed',sourceExists=False,migrationRequired=False,sourceOpenedReadOnly=True)
    initial=(source.stat().st_size,source.stat().st_mtime_ns)
    with tempfile.TemporaryDirectory(prefix='momo-migration-check-') as folder:
        copy=Path(folder)/'copy.sqlite3'
        with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as original:
            original.execute('PRAGMA query_only=ON')
            with closing(sqlite3.connect(copy)) as target:
                original.backup(target)
                before=legacy_digest(target)
                old=target.execute('PRAGMA user_version').fetchone()[0]
        storage=Storage(copy,ROOT/'static/content')
        with storage.connect() as migrated:
            after=legacy_digest(migrated)
            integrity=migrated.execute('PRAGMA integrity_check').fetchone()[0]
            version=migrated.execute('PRAGMA user_version').fetchone()[0]
    unchanged=initial==(source.stat().st_size,source.stat().st_mtime_ns)
    return dict(status='passed' if before==after and integrity=='ok' and version==VERSION and unchanged else 'failed',
                sourceFile=str(source),sourceExists=True,sourceOpenedReadOnly=True,sourceUnchangedDuringCheck=unchanged,
                oldVersion=old,newVersion=version,migrationRequired=old<VERSION,copyBackupCreated=bool(storage.backup_path),
                integrity=integrity,before=before,after=after,timestamp=datetime.now(timezone.utc).isoformat())


def main():
    source=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'data.sqlite3'
    try: report=inspect_migration(source)
    except Exception as error: report=dict(status='failed',error=str(error),sourceOpenedReadOnly=True)
    output=ROOT/'reports'/'s3-migration.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0 if report['status']=='passed' else 1


if __name__=='__main__':sys.exit(main())
