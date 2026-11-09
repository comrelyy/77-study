"""Versioned local storage. Construction migrates only the explicitly supplied DB."""
import hashlib
import hmac
import json
import math
import re
import secrets
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path
from contextlib import contextmanager, closing

VERSION = 3
MODULES = ('story', 'dialogue', 'game', 'summary', 'lesson')


class ServiceError(ValueError):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.status = code, status


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', value):
        raise ServiceError('invalid_id', '编号无效')
    return value


def derive(value, salt):
    return hashlib.scrypt(value.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)


SCHEMA = """
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,day TEXT,kind TEXT,payload TEXT,created REAL);
CREATE TABLE IF NOT EXISTS clock(day TEXT PRIMARY KEY,seconds REAL);
CREATE TABLE IF NOT EXISTS meta(id INTEGER PRIMARY KEY CHECK(id=1),segment_limit REAL NOT NULL DEFAULT 480,
 daily_limit REAL NOT NULL DEFAULT 900,current_segment TEXT,latest_day TEXT NOT NULL,
 pin_salt BLOB,pin_hash BLOB,recovery_salt BLOB,recovery_hash BLOB,
 auth_failures INTEGER NOT NULL DEFAULT 0,blocked_until REAL NOT NULL DEFAULT 0,migration_note TEXT);
CREATE TABLE IF NOT EXISTS segments(id TEXT PRIMARY KEY,used REAL NOT NULL DEFAULT 0,
 opened REAL NOT NULL,exhausted_at REAL);
CREATE TABLE IF NOT EXISTS daily_status(day TEXT PRIMARY KEY,exhausted_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT,token TEXT,expires REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS lease_history(token TEXT PRIMARY KEY,owner TEXT NOT NULL,started REAL NOT NULL,
 expires REAL NOT NULL,revoked REAL);
CREATE TABLE IF NOT EXISTS experiences(id TEXT PRIMARY KEY,started REAL NOT NULL,ended REAL);
CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,kind TEXT NOT NULL,
 result TEXT NOT NULL,created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,started INTEGER NOT NULL,
 ended INTEGER NOT NULL,segment TEXT NOT NULL,allocations TEXT NOT NULL,result TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ledger_intervals ON ledger(started,ended);
CREATE TABLE IF NOT EXISTS progress(scene TEXT NOT NULL,module TEXT NOT NULL,version TEXT NOT NULL,
 state TEXT NOT NULL,revision INTEGER NOT NULL,updated REAL NOT NULL,PRIMARY KEY(scene,module));
CREATE TABLE IF NOT EXISTS reminders(segment TEXT NOT NULL,day TEXT NOT NULL,PRIMARY KEY(segment,day));
CREATE TABLE IF NOT EXISTS diagnostics(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,details TEXT NOT NULL,created REAL NOT NULL);
"""


class Storage:
    def __init__(self, db, content_root, now=time.time, limits_enabled=True):
        self.path = Path(db).resolve()
        self.content_root = Path(content_root)
        self.now = now
        self.limits_enabled = limits_enabled
        self.instance_id = secrets.token_urlsafe(12)
        self.packs = {}
        for file in self.content_root.glob('*.json'):
            pack = json.loads(file.read_text(encoding='utf-8'))
            if 'sceneId' in pack:
                self.packs[pack['sceneId']] = pack
        self.backup_path = self.migrate()

    def content_pack(self, scene, version, archive=False):
        if not isinstance(scene,str) or not re.fullmatch(r'[a-z][a-z0-9-]*',scene) or not isinstance(version,str) or not re.fullmatch(r'\d+\.\d+\.\d+',version):
            return None
        pack = self.packs.get(scene)
        if pack and pack['contentVersion'] == version:
            return pack
        # A running development service may predate the files served to the browser.
        try:
            current = json.loads((self.content_root / (scene+'.json')).read_text(encoding='utf-8'))
        except (OSError,ValueError):
            return None
        if not isinstance(current,dict):
            return None
        if current.get('sceneId') == scene and current.get('contentVersion') == version:
            self.packs[scene] = current
            return current
        if pack and archive:
            file = self.content_root / 'archive' / (scene+'.'+version+'.json')
            if file.is_file():
                old = json.loads(file.read_text(encoding='utf-8'))
                if old.get('sceneId') == scene and old.get('contentVersion') == version:
                    return old
        return None

    @contextmanager
    def connect(self):
        c = sqlite3.connect(self.path, timeout=10)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA busy_timeout=10000')
        try:
            with c:
                yield c
        finally:
            c.close()

    def migrate(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        existed = self.path.exists() and self.path.stat().st_size > 0
        backup = None
        with self.connect() as c:
            version = c.execute('PRAGMA user_version').fetchone()[0]
            if version > VERSION:
                raise ServiceError('newer_database', '数据库版本较新，请勿用旧程序打开')
            if version == VERSION:
                return None
            if version not in (0,):
                raise ServiceError('unknown_migration', '没有对应的数据库升级路径')
            if existed:
                folder = self.path.parent / 'backups'
                folder.mkdir(exist_ok=True)
                backup = folder / ('pre-v3-' + datetime.fromtimestamp(self.now()).strftime('%Y%m%d-%H%M%S-') + secrets.token_hex(6) + '.sqlite3')
                with closing(sqlite3.connect(backup)) as target:
                    c.backup(target)
                    if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                        raise ServiceError('backup_failed', '升级备份未通过完整性检查')
            day = self.day(self.now())
            c.executescript('BEGIN IMMEDIATE;\n' + SCHEMA)
            try:
                c.execute('INSERT OR IGNORE INTO meta(id,latest_day) VALUES(1,?)', (day,))
                c.execute('INSERT OR IGNORE INTO lease(id) VALUES(1)')
                old = c.execute('SELECT seconds FROM clock WHERE day=?', (day,)).fetchone()
                if old and (old[0] is None or not math.isfinite(old[0]) or old[0] < 0):
                    raise ServiceError('invalid_legacy_clock', '原有计时数据需核查，升级已停止')
                if old and old[0] > 0:
                    segment = secrets.token_urlsafe(18)
                    used = min(float(old[0]), 480)
                    c.execute('INSERT INTO segments VALUES(?,?,?,?)', (segment, used, self.now(), self.now() if used >= 480 else None))
                    note = '旧版单段用时无法独立核实，首次按当日已用保守计入单段；历史与每日用时未清除。'
                    c.execute('UPDATE meta SET current_segment=?,migration_note=? WHERE id=1', (segment, note))
                c.execute('PRAGMA user_version=3')
                c.commit()
            except Exception:
                c.rollback()
                raise
        return str(backup) if backup else None

    @staticmethod
    def day(timestamp):
        return datetime.fromtimestamp(timestamp).date().isoformat()

    def observe_day(self, c, now):
        day = self.day(now)
        latest = c.execute('SELECT latest_day FROM meta WHERE id=1').fetchone()[0]
        if day < latest:
            return False
        if day > latest:
            if (datetime.fromisoformat(day) - datetime.fromisoformat(latest)).days > 1:
                c.execute('INSERT INTO diagnostics(kind,details,created) VALUES(?,?,?)', ('date_jump', canonical({'from': latest, 'to': day}), now))
            c.execute('UPDATE meta SET latest_day=? WHERE id=1', (day,))
        return True

    def require_day(self, c, now):
        if not self.observe_day(c, now):
            raise ServiceError('date_rollback', '设备日期倒退，恢复正确日期后再继续', 409)

    def quota(self, c, now):
        m = c.execute('SELECT * FROM meta WHERE id=1').fetchone()
        row = c.execute('SELECT seconds FROM clock WHERE day=?', (self.day(now),)).fetchone()
        daily = float(row[0]) if row else 0
        segment = c.execute('SELECT * FROM segments WHERE id=?', (m['current_segment'],)).fetchone()
        used = segment['used'] if segment else 0
        remaining = max(0, min(m['daily_limit'] - daily, m['segment_limit'] - used))
        rollback = self.day(now) < m['latest_day']
        return dict(day=self.day(now),dailyUsed=daily,segmentUsed=used,dailyLimit=m['daily_limit'],segmentLimit=m['segment_limit'],
                    dailyRemaining=max(0,m['daily_limit']-daily),segmentRemaining=max(0,m['segment_limit']-used),
                    remaining=remaining,allowed=(remaining>0 or not self.limits_enabled) and not rollback,limitsEnabled=self.limits_enabled,segmentId=m['current_segment'],dateAnomaly=rollback,
                    authorityInstance=self.instance_id,authoritySequence=time.monotonic_ns()//1000)

    def snapshot(self, c, now):
        q = self.quota(c, now)
        events = []
        for row in c.execute('SELECT * FROM events ORDER BY created DESC'):
            try:
                payload = json.loads(row['payload'])
                if not isinstance(payload, dict):
                    payload = {}
            except (ValueError, TypeError):
                payload = {}
            events.append(dict(id=row['id'],day=row['day'],kind=row['kind'],payload=payload,created=row['created']))
        progress, notices = [], []
        for row in c.execute('SELECT * FROM progress ORDER BY updated DESC'):
            pack = self.packs.get(row['scene'])
            compatible = bool(pack and (pack['contentVersion'] == row['version'] or row['version'] in pack.get('compatibleFrom', [])))
            try:
                state = json.loads(row['state']) if compatible else None
                if compatible:
                    self.validate_progress(row['scene'],row['module'],pack['contentVersion'],state)
            except (ValueError,TypeError,ServiceError):
                state,compatible=None,False
            if not compatible:
                notices.append('内容更新：'+row['scene']+'/'+row['module']+' 的位置已重置，历史、贴纸和额度保留。')
            progress.append(dict(sceneId=row['scene'],moduleId=row['module'],contentVersion=row['version'],state=state,compatible=compatible,revision=row['revision']))
        m = c.execute('SELECT * FROM meta WHERE id=1').fetchone()
        if m['migration_note']:
            notices.append(m['migration_note'])
        days = {e['day'] for e in events if e['kind'] in ('introduced','choice')}
        modules = {(e['payload'].get('experienceId'),e['payload'].get('sceneId'),e['payload'].get('moduleId')) for e in events if e['kind'] in ('introduced','choice') and all(e['payload'].get(k) for k in ('experienceId','sceneId','moduleId'))}
        return dict(schemaVersion=3,seconds=q['dailyUsed'],quota=q,events=events,progress=progress,notices=notices,
                    settings=dict(segmentSeconds=m['segment_limit'],dailySeconds=m['daily_limit'],pinConfigured=m['pin_hash'] is not None),
                    summary=dict(participationDays=len(days),moduleParticipations=len(modules),timeSource='confirmed ledger; legacy daily totals retained'))

    def state(self):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.observe_day(c, self.now())
            return self.snapshot(c, self.now())

    def require_lease(self, c, body, now):
        row = c.execute('SELECT * FROM lease WHERE id=1').fetchone()
        if not body.get('token') or row['owner'] != body.get('owner') or not hmac.compare_digest(row['token'] or '', body['token']) or row['expires'] <= now:
            raise ServiceError('lease_lost', '这个活动页已经停止，请回原页面或重新连接', 409)
        c.execute('UPDATE lease SET expires=? WHERE id=1', (now+10,))
        c.execute('UPDATE lease_history SET expires=? WHERE token=?', (now+10, fingerprint(body['token'])))
        return row

    def begin(self, body):
        owner = identifier(body.get('owner'))
        experience = identifier(body.get('experienceId'))
        now = self.now()
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.require_day(c, now)
            q = self.quota(c, now)
            if not q['allowed'] and body.get('recoverOnly') is not True:
                raise ServiceError('quota_exhausted', '这一段或今天已经到点，请家长一起看看', 409)
            row = c.execute('SELECT * FROM lease WHERE id=1').fetchone()
            resume_owner=body.get('previousOwner')
            resume_token=body.get('resumeToken')
            handover=(row['owner'] and resume_owner==row['owner'] and isinstance(resume_token,str)
                      and row['token'] and hmac.compare_digest(row['token'],resume_token))
            if row['owner'] and row['owner'] != owner and row['expires'] > now and not handover:
                error=ServiceError('other_page_active', '另一个页面正在活动，请回到原页面', 409)
                error.retry_after_ms=max(1,math.ceil((row['expires']-now)*1000))
                raise error
            if row['token']:
                c.execute('UPDATE lease_history SET revoked=? WHERE token=?', (now,fingerprint(row['token'])))
            token = secrets.token_urlsafe(32)
            c.execute('UPDATE lease SET owner=?,token=?,expires=? WHERE id=1', (owner,token,now+10))
            c.execute('INSERT INTO lease_history VALUES(?,?,?,?,NULL)', (fingerprint(token),owner,now,now+10))
            if not q['segmentId']:
                segment = secrets.token_urlsafe(18)
                c.execute('INSERT INTO segments(id,opened) VALUES(?,?)', (segment,now))
                c.execute('UPDATE meta SET current_segment=? WHERE id=1', (segment,))
            old = c.execute('SELECT ended FROM experiences WHERE id=?', (experience,)).fetchone()
            if old and old['ended'] is not None:
                raise ServiceError('experience_closed', '这次体验已经结束，请重新开始', 409)
            c.execute('INSERT OR IGNORE INTO experiences(id,started) VALUES(?,?)', (experience,now))
            result = self.snapshot(c,now)
            result.update(token=token,experienceId=experience)
            return result

    def heartbeat(self, body):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.require_day(c,self.now())
            self.require_lease(c,body,self.now())
            return self.snapshot(c,self.now())

    def release(self, body):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row = c.execute('SELECT * FROM lease WHERE id=1').fetchone()
            if row['owner'] == body.get('owner') and row['token'] and hmac.compare_digest(row['token'],body.get('token','')):
                c.execute('UPDATE lease_history SET revoked=? WHERE token=?', (self.now(),fingerprint(row['token'])))
                c.execute('UPDATE lease SET owner=NULL,token=NULL,expires=0 WHERE id=1')
            return {'ok':True}

    def tick(self, body):
        operation_id = identifier(body.get('id'))
        start,end = body.get('startedAt'),body.get('endedAt')
        if not all(isinstance(x,(float,int)) and not isinstance(x,bool) and math.isfinite(x) for x in (start,end)) or start<0 or not 0<=end-start<=5000 or end>self.now()*1000+500:
            raise ServiceError('invalid_interval','计时片段无效')
        start,end = int(start),int(end)
        semantic = dict(startedAt=start,endedAt=end,segmentId=body.get('segmentId'))
        digest = fingerprint(semantic)
        now = self.now()
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.require_day(c,now)
            self.require_lease(c,body,now)
            old = c.execute('SELECT * FROM ledger WHERE id=?', (operation_id,)).fetchone()
            if old:
                if old['fingerprint'] != digest:
                    raise ServiceError('id_conflict','同一计时编号的内容不一致',409)
                return dict(json.loads(old['result']),quota=self.quota(c,now))
            segment = c.execute('SELECT * FROM segments WHERE id=?', (body.get('segmentId'),)).fetchone()
            if not segment:
                raise ServiceError('invalid_segment','单段编号无效')
            proof = c.execute('SELECT * FROM lease_history WHERE token=?', (fingerprint(body.get('originToken',body['token'])),)).fetchone()
            if not proof or start/1000<proof['started']-.5 or end/1000>min(proof['expires'],proof['revoked'] if proof['revoked'] is not None else proof['expires'])+.5:
                raise ServiceError('invalid_interval_lease','计时片段不属于有效活动页',409)
            if c.execute('SELECT 1 FROM ledger WHERE started<? AND ended>?', (end,start)).fetchone():
                raise ServiceError('overlapping_interval','计时片段重叠，需核对未确认片段',409)
            before = self.quota(c,now)['remaining']
            m = c.execute('SELECT * FROM meta WHERE id=1').fetchone()
            allocations,charged = {},0.0
            cursor = start/1000
            while cursor<end/1000:
                d = datetime.fromtimestamp(cursor)
                midnight = datetime.combine(d.date()+timedelta(days=1),datetime.min.time()).timestamp()
                boundary = min(midnight,end/1000)
                day = d.date().isoformat()
                row = c.execute('SELECT seconds FROM clock WHERE day=?',(day,)).fetchone()
                used = float(row[0]) if row else 0
                amount = boundary-cursor if not self.limits_enabled else max(0,min(boundary-cursor,m['daily_limit']-used,m['segment_limit']-segment['used']-charged))
                c.execute('INSERT INTO clock VALUES(?,?) ON CONFLICT(day) DO UPDATE SET seconds=ROUND(seconds+excluded.seconds,6)',(day,amount))
                allocations[day] = amount
                charged += amount
                if self.limits_enabled and used+amount>=m['daily_limit']:
                    c.execute('INSERT OR IGNORE INTO daily_status VALUES(?,?)',(day,cursor+amount))
                cursor=boundary
            exhausted = start/1000+charged if self.limits_enabled and segment['used']+charged>=m['segment_limit'] else None
            c.execute('UPDATE segments SET used=ROUND(used+?,6),exhausted_at=COALESCE(exhausted_at,?) WHERE id=?',(charged,exhausted,body['segmentId']))
            after = self.quota(c,now)
            reminder = None
            if self.limits_enabled and before>30 and after['remaining']<=30 and after['remaining']>0:
                inserted = c.execute('INSERT OR IGNORE INTO reminders VALUES(?,?)',(body['segmentId'],self.day(now))).rowcount
                if inserted:
                    reminder=body['segmentId']+':'+self.day(now)+':30'
            result=dict(ok=True,id=operation_id,deducted=charged,reminderId=reminder)
            c.execute('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)',(operation_id,digest,start,end,body['segmentId'],canonical(allocations),canonical(result)))
            return dict(result,quota=after)

    def validate_progress(self, scene, module, version, state):
        pack = self.content_pack(scene,version)
        if not pack or module not in MODULES or version != pack['contentVersion'] or not isinstance(state,dict) or len(canonical(state))>64000:
            raise ServiceError('invalid_progress','进度或内容版本无效')
        identifier(state.get('practiceId'))
        items = pack['modules'][module] if module in ('story','dialogue') else pack['modules']['game']['questions'] if module=='game' else (pack.get('lesson') or {}).get('steps',[]) if module=='lesson' else []
        step = next((x for x in items if x['id']==state.get('stepId')),None)
        if module!='summary' and not step:
            raise ServiceError('invalid_step','进度步骤已经失效')
        if module=='story':
            ids={x['id'] for x in step['segments']}
            if state.get('fragmentId') is not None and state['fragmentId'] not in ids or not isinstance(state.get('heard',[]),list) or not set(state.get('heard',[])).issubset(ids):
                raise ServiceError('invalid_fragment','故事片段无效')
        if module=='dialogue':
            options={x['id']:x for x in step['options']}
            selection=state.get('selectedId')
            if selection is not None and selection not in options:
                raise ServiceError('invalid_selection','对话选择无效')
            limit=1+len(options[selection]['followUp']) if selection else 0
            if type(state.get('speechIndex',0)) is not int or not 0<=state.get('speechIndex',0)<=limit:
                raise ServiceError('invalid_speech_position','对话声音位置无效')
            if state.get('confirmed') and not selection:
                raise ServiceError('missing_selection','确认回应缺少选择')
        if module=='lesson':
            kind=step['kind']
            if type(state.get('attempts',0)) is not int or not 0<=state.get('attempts',0)<=100000 or type(state.get('revealed',False)) is not bool:
                raise ServiceError('invalid_attempts','尝试记录无效')
            matched=state.get('matched',[])
            if not isinstance(matched,list) or not set(matched).issubset(set(step['words']) if kind=='match' else set()):
                raise ServiceError('invalid_match','配对进度无效')
            rounds=step['rounds'] if kind=='reply' else []
            index=state.get('roundIndex',0)
            if type(index) is not int or not (0<=index<len(rounds) if kind=='reply' else index==0):
                raise ServiceError('invalid_round','回应轮次无效')
            story=next((x for x in pack['modules']['story'] if x['id']==step.get('storyId')),None) if kind=='story' else None
            ids={x['id'] for x in story['segments']} if story else set()
            heard,fragment=state.get('heard',[]),state.get('fragmentId')
            if not isinstance(heard,list) or not set(heard).issubset(ids) or fragment is not None and fragment not in ids:
                raise ServiceError('invalid_fragment','故事片段无效')
        if module=='game':
            if not isinstance(state.get('order'),list) or len(state['order'])!=len(step['options']) or set(state['order'])!=set(step['options']):
                raise ServiceError('invalid_order','游戏候选顺序无效')
            if type(state.get('attempts',0)) is not int or not 0<=state.get('attempts',0)<=100000:
                raise ServiceError('invalid_attempts','尝试记录无效')
            if state.get('selectedId') is not None and state['selectedId'] not in step['options']:
                raise ServiceError('invalid_selection','游戏物品无效')
            if pack['modules']['game']['type']=='story-order':
                sequence=state.get('sequenceOrder')
                if not isinstance(sequence,list) or any(not isinstance(w,str) for w in sequence) or len(set(sequence))!=len(sequence) or any(w not in step['options'] for w in sequence) or state.get('selectedId')!=(sequence[-1] if sequence else None):
                    raise ServiceError('invalid_sequence','故事顺序进度无效')
        return pack

    def write_progress(self,c,body,now):
        scene,module,version,state=body.get('sceneId'),body.get('moduleId'),body.get('contentVersion'),body.get('state')
        self.validate_progress(scene,module,version,state)
        old=c.execute('SELECT revision FROM progress WHERE scene=? AND module=?',(scene,module)).fetchone()
        if 'expectedRevision' in body and body['expectedRevision']!=(old[0] if old else 0):
            raise ServiceError('progress_conflict','已有较新的进度，旧位置不会覆盖它',409)
        c.execute('INSERT INTO progress VALUES(?,?,?,?,1,?) ON CONFLICT(scene,module) DO UPDATE SET version=excluded.version,state=excluded.state,revision=progress.revision+1,updated=excluded.updated',
                  (scene,module,version,canonical(state),now))
        return c.execute('SELECT revision FROM progress WHERE scene=? AND module=?',(scene,module)).fetchone()[0]

    def submit(self, body):
        op = body.get('operation')
        if not isinstance(op,dict):
            raise ServiceError('invalid_operation','提交内容无效')
        operation_id = identifier(op.get('id'))
        kind,payload = op.get('kind'),op.get('payload')
        if kind not in ('introduced','choice','end','checkpoint') or not isinstance(payload,dict) or len(canonical(op))>128000:
            raise ServiceError('invalid_operation','提交类型或内容无效')
        digest=fingerprint(op)
        now=self.now()
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            self.require_day(c,now)
            self.require_lease(c,body,now)
            old=c.execute('SELECT * FROM operations WHERE id=?',(operation_id,)).fetchone()
            if old:
                if old['fingerprint']!=digest:
                    raise ServiceError('id_conflict','同一操作编号的内容不一致',409)
                return dict(json.loads(old['result']),quota=self.quota(c,now))
            scene,module,version=payload.get('sceneId'),payload.get('moduleId'),payload.get('contentVersion')
            pack=self.content_pack(scene,version,archive=True)
            historical=bool(pack and version!=self.packs[scene]['contentVersion'])
            if not pack or (kind!='end' and module not in MODULES):
                raise ServiceError('invalid_content','情景或模块版本无效')
            experience=identifier(op.get('experienceId'))
            if not c.execute('SELECT 1 FROM experiences WHERE id=?',(experience,)).fetchone():
                raise ServiceError('invalid_experience','体验编号无效')
            segment=c.execute('SELECT * FROM segments WHERE id=?',(op.get('segmentId'),)).fetchone()
            if not segment:
                raise ServiceError('invalid_segment','单段编号无效')
            confirmed=op.get('confirmedAt')
            if not isinstance(confirmed,(float,int)) or not math.isfinite(confirmed) or confirmed>now*1000+500:
                raise ServiceError('invalid_confirmation','确认时间无效')
            proof=c.execute('SELECT * FROM lease_history WHERE token=?',(fingerprint(op.get('confirmationLease',body['token'])),)).fetchone()
            if kind!='end' and (not proof or confirmed/1000<proof['started']-.5 or confirmed/1000>min(proof['expires'],proof['revoked'] if proof['revoked'] is not None else proof['expires'])+.5):
                raise ServiceError('invalid_confirmation','确认不属于有效活动页',409)
            day=self.day(confirmed/1000)
            if kind not in ('end','checkpoint'):
                cutoff=[x for x in (segment['exhausted_at'],) if x is not None]
                daily=c.execute('SELECT exhausted_at FROM daily_status WHERE day=?',(day,)).fetchone()
                if daily:
                    cutoff.append(daily[0])
                if self.limits_enabled and cutoff and confirmed/1000>min(cutoff):
                    raise ServiceError('quota_exhausted','到点后不能提交新的选择',409)
                self.validate_participation(pack,kind,payload)
            revision=None
            progress_conflict=False
            if op.get('progress'):
                progress=op['progress']
                if progress.get('sceneId')!=scene or progress.get('moduleId')!=module:
                    raise ServiceError('invalid_progress','事件与进度归属不一致')
                if not historical:
                    try:
                        revision=self.write_progress(c,progress,now)
                    except ServiceError as error:
                        if error.code!='progress_conflict' or kind=='checkpoint':
                            raise
                        progress_conflict=True  # Keep the confirmed fact, but never rewind newer progress.
            elif kind=='checkpoint':
                raise ServiceError('missing_progress','缺少进度内容')
            sticker=False
            if kind!='checkpoint':
                saved=dict(payload,experienceId=experience)
                c.execute('INSERT INTO events VALUES(?,?,?,?,?)',(operation_id,day,kind,canonical(saved),confirmed/1000))
                if kind in ('introduced','choice'):
                    sticker=c.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)',('sticker-'+scene,day,'sticker',canonical({'theme':scene,'sceneId':scene,'contentVersion':version}),now)).rowcount>0
                if kind=='end':
                    c.execute('UPDATE experiences SET ended=COALESCE(ended,?) WHERE id=?',(now,experience))
            result=dict(ok=True,id=operation_id,stickerGranted=sticker,revision=revision,progressConflict=progress_conflict,contentUpdated=historical)
            c.execute('INSERT INTO operations VALUES(?,?,?,?,?)',(operation_id,digest,kind,canonical(result),now))
            return dict(result,quota=self.quota(c,now))

    def validate_participation(self,pack,kind,p):
        if kind=='introduced':
            word=next((w for w in pack['words'] if w['id']==p.get('wordId')),None)
            if not word or p.get('text')!=word['text'] or p.get('mode')!='word_listen':
                raise ServiceError('invalid_word_event','词音记录不完整')
            return
        mode=p.get('mode')
        if mode=='story_listen':
            step=next((s for s in pack['modules']['story'] if s['id']==p.get('stepId')),None)
            if not step or p.get('heard')!=[s['id'] for s in step['segments']] or p.get('segments')!=[{'id':s['id'],'text':s['text']} for s in step['segments']]:
                raise ServiceError('incomplete_story','尚未完整听完这一幕')
        elif mode=='lesson_answer':
            self.validate_lesson_answer(pack,p)
        elif mode=='dialogue_reply':
            step=next((s for s in pack['modules']['dialogue'] if s['id']==p.get('stepId')),None)
            choice=next((o for o in step['options'] if o['id']==p.get('selectedId')),None) if step else None
            if not choice or p.get('text')!=choice['text'] or p.get('source') not in ('child','demo'):
                raise ServiceError('invalid_reply','回应记录无效')
        elif mode in ('packing_game','tidy_game','scene_find_game','story_order_game'):
            game=pack['modules']['game'];step=next((s for s in game['questions'] if s['id']==p.get('stepId')),None)
            if {'listen-pack':'packing_game','select-place':'tidy_game','scene-find':'scene_find_game','story-order':'story_order_game'}.get(game['type'])!=mode:
                raise ServiceError('invalid_game_mode','游戏类型与记录不一致')
            if not step or p.get('selectedId') not in step['options'] or not isinstance(p.get('attempt'),int) or p['attempt']<1:
                raise ServiceError('invalid_game_attempt','游戏尝试无效')
            if game['type'] in ('listen-pack','scene-find') and p.get('targetAudioCompleted') is not True:
                raise ServiceError('sound_not_completed','还没有完整听完目标词音')
            if game['type']=='select-place' and p.get('zone') not in [z['id'] for z in game['zones']]:
                raise ServiceError('invalid_zone','收纳区无效')
            matched=p['selectedId']==step['target'] and (game['type']!='select-place' or p.get('zone')==step['zone'])
            if game['type']=='story-order':
                sequence=p.get('sequenceOrder')
                if not isinstance(sequence,list) or any(not isinstance(w,str) for w in sequence) or len(sequence)!=len(step['solution']) or len(set(sequence))!=len(sequence) or set(sequence)!=set(step['options']) or p['selectedId']!=sequence[-1]:
                    raise ServiceError('invalid_sequence','完整故事顺序无效')
                matched=sequence==step['solution']
            if p.get('matched') is not matched:
                raise ServiceError('invalid_match','游戏结果不一致')
        else:
            raise ServiceError('invalid_participation','预听、示范和跳过不产生参与贴纸')

    @staticmethod
    def validate_lesson_answer(pack,p):
        fail=ServiceError('invalid_lesson_answer','课程作答记录无效')
        step=next((s for s in (pack.get('lesson') or {}).get('steps',[]) if s['id']==p.get('stepId')),None)
        if p.get('moduleId')!='lesson' or not step or step['kind'] not in ('quiz','fill','reply','match') or type(p.get('attempt')) is not int or p['attempt']<1 or type(p.get('correct')) is not bool:
            raise fail
        selected,kind=p.get('selectedId'),step['kind']
        if kind in ('quiz','fill'):
            ok=selected in step['options'] and p['correct']==(selected==step['answer'])
        elif kind=='reply':
            index=p.get('roundIndex')
            if type(index) is not int or not 0<=index<len(step['rounds']):
                raise fail
            r=step['rounds'][index]
            ok=selected in (r['answer'],r['wrong']['id']) and p['correct']==(selected==r['answer'])
        else:
            target=p.get('targetId')
            ok=target in step['words'] and selected in step['words'] and p['correct']==(target==selected)
        if not ok:
            raise fail

    @staticmethod
    def validate_pin(pin):
        if not isinstance(pin,str) or not re.fullmatch(r'\d{4}',pin,flags=re.ASCII):
            raise ServiceError('invalid_pin','PIN需要四位数字')

    def install_secrets(self,c,pin):
        self.validate_pin(pin)
        salt,recovery_salt=secrets.token_bytes(16),secrets.token_bytes(16)
        recovery=secrets.token_urlsafe(18)
        c.execute('UPDATE meta SET pin_salt=?,pin_hash=?,recovery_salt=?,recovery_hash=?,auth_failures=0,blocked_until=0 WHERE id=1',
                  (salt,derive(pin,salt),recovery_salt,derive(recovery,recovery_salt)))
        return recovery

    def setup_pin(self,body):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if c.execute('SELECT pin_hash FROM meta WHERE id=1').fetchone()[0] is not None:
                raise ServiceError('pin_exists','PIN已经设置',409)
            return dict(ok=True,recoveryCode=self.install_secrets(c,body.get('pin')))

    def authenticate(self,c,value,recovery=False):
        m=c.execute('SELECT * FROM meta WHERE id=1').fetchone()
        if m['blocked_until']>self.now():
            raise ServiceError('auth_throttled','请稍后再试',429)
        prefix='recovery' if recovery else 'pin'
        correct=isinstance(value,str) and m[prefix+'_hash'] is not None and hmac.compare_digest(derive(value,m[prefix+'_salt']),m[prefix+'_hash'])
        if not correct:
            failures=m['auth_failures']+1
            c.execute('UPDATE meta SET auth_failures=?,blocked_until=? WHERE id=1',(failures,self.now()+30 if failures>=5 else 0))
            c.commit()  # Failed authorization must retain its rate limit counter.
            raise ServiceError('auth_failed','校验没有通过',403)
        c.execute('UPDATE meta SET auth_failures=0,blocked_until=0 WHERE id=1')

    def reset_pin(self,body):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');self.authenticate(c,body.get('recoveryCode'),True)
            return dict(ok=True,recoveryCode=self.install_secrets(c,body.get('newPin')))

    def new_segment(self,body):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');self.require_day(c,self.now());self.authenticate(c,body.get('pin'))
            if self.quota(c,self.now())['dailyRemaining']<=0:
                raise ServiceError('daily_exhausted','今天的额度不能追加',409)
            if self.quota(c,self.now())['segmentRemaining']>0:
                raise ServiceError('segment_not_exhausted','当前单段还未到点，不能提前续满',409)
            segment=secrets.token_urlsafe(18)
            c.execute('INSERT INTO segments(id,opened) VALUES(?,?)',(segment,self.now()))
            c.execute('UPDATE meta SET current_segment=? WHERE id=1',(segment,))
            return self.snapshot(c,self.now())

    def lower_limits(self,body):
        a,b=body.get('segmentSeconds'),body.get('dailySeconds')
        if not all(isinstance(x,int) and not isinstance(x,bool) for x in (a,b)) or not 60<=a<=480 or not 60<=b<=900 or a>b:
            raise ServiceError('invalid_limits','时长范围无效')
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');self.authenticate(c,body.get('pin'))
            m=c.execute('SELECT * FROM meta WHERE id=1').fetchone()
            if a>m['segment_limit'] or b>m['daily_limit']:
                raise ServiceError('increase_forbidden','本轮只允许下调时长')
            c.execute('UPDATE meta SET segment_limit=?,daily_limit=? WHERE id=1',(a,b))
            q=self.quota(c,self.now())
            if q['segmentRemaining']==0:
                c.execute('UPDATE segments SET exhausted_at=COALESCE(exhausted_at,?) WHERE id=?',(self.now(),q['segmentId']))
            if q['dailyRemaining']==0:
                c.execute('INSERT OR IGNORE INTO daily_status VALUES(?,?)',(self.day(self.now()),self.now()))
            return self.snapshot(c,self.now())

    def export_data(self,body):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');self.authenticate(c,body.get('pin'))
            # Explicit allowlist: never serialize meta or authentication materials.
            tables={name:[dict(row) for row in c.execute('SELECT * FROM '+name)]
                    for name in ('events','clock','segments','experiences','progress','ledger')}
            return dict(schemaVersion=3,exportedAt=self.now(),data=tables)

    def clear_data(self,body):
        if body.get('confirmation')!='清除全部记录':
            raise ServiceError('confirmation_required','请输入清除全部记录进行二次确认')
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');self.authenticate(c,body.get('pin'))
            for table in ('events','clock','segments','daily_status','lease_history','experiences','operations','ledger','progress','reminders','diagnostics'):
                c.execute('DELETE FROM '+table)
            c.execute('UPDATE lease SET owner=NULL,token=NULL,expires=0')
            c.execute('UPDATE meta SET current_segment=NULL,latest_day=? WHERE id=1',(self.day(self.now()),))
            return dict(ok=True)
