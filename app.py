import json, sqlite3, time, math, argparse
from datetime import datetime
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from storage_v3 import Storage, ServiceError

ROOT = Path(__file__).parent
DB = ROOT / 'data.sqlite3'

def save_event(c, d, day):
    event_id, kind, payload = d.get('id'), d.get('kind'), d.get('payload', {})
    if not isinstance(event_id, str) or not 1 <= len(event_id) <= 128:
        raise ValueError('invalid event id')
    if kind not in ['introduced', 'choice', 'skip', 'end', 'confirmation']:
        raise ValueError('invalid kind')
    if not isinstance(payload, dict):
        raise ValueError('invalid payload')
    theme = payload.get('theme')
    if theme not in (None, 'picnic'):
        raise ValueError('invalid theme')
    inserted = c.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)',
        (event_id, day, kind, json.dumps(payload, ensure_ascii=False), time.time())).rowcount
    if inserted and kind in ['introduced', 'choice']:
        sticker_id = 'sticker-picnic' if theme == 'picnic' else 'sticker-red'
        c.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)',
            (sticker_id, day, 'sticker', json.dumps({'theme': theme or 'red'}), time.time()))

def add_time(c, day, value):
    seconds = float(value)
    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError('invalid seconds')
    c.execute('INSERT INTO clock VALUES(?,?) ON CONFLICT(day) DO UPDATE SET seconds=MIN(900,seconds+excluded.seconds)',
              (day, min(5, seconds)))
def connect():
    c = sqlite3.connect(DB)
    c.execute('CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, day TEXT, kind TEXT, payload TEXT, created REAL)')
    c.execute('CREATE TABLE IF NOT EXISTS clock(day TEXT PRIMARY KEY, seconds REAL)')
    return c

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'static'), **kwargs)
    def reply(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path in ('/api/state','/api/v3/state'):
            try: return self.reply(self.server.storage.state())
            except ServiceError as e: return self.reply({'error':str(e),'code':e.code},e.status)
            except Exception: return self.reply({'error':'本机记录暂时无法读取','code':'storage_failed'},500)
        if self.path == '/api/v3/version':
            return self.reply({'schemaVersion':3,'capabilities':{'leaseHandover':True}})
        super().do_GET()
    def do_POST(self):
        try:
            origin=self.headers.get('Origin')
            port=self.server.server_address[1]
            if origin and origin not in ('http://127.0.0.1:'+str(port),'http://localhost:'+str(port)):
                return self.reply({'error':'请求来源不受支持','code':'origin_rejected'},403)
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<=262144:
                return self.reply({'error':'请求大小无效','code':'invalid_request'},400)
            if self.headers.get_content_type()!='application/json':
                return self.reply({'error':'需要JSON请求','code':'invalid_request'},415)
            d=json.loads(self.rfile.read(length))
            if not isinstance(d,dict): return self.reply({'error':'请求格式无效','code':'invalid_request'},400)
            routes={'enter':'begin','heartbeat':'heartbeat','release':'release','tick':'tick','operation':'submit',
                    'pin/setup':'setup_pin','pin/recover':'reset_pin','segment/new':'new_segment','limits/lower':'lower_limits',
                    'data/export':'export_data','data/clear':'clear_data'}
            route=self.path.removeprefix('/api/v3/')
            if self.path in ('/api/event','/api/tick'):
                return self.reply({'error':'请刷新页面以连接新的保存服务','code':'upgrade_required'},409)
            if not self.path.startswith('/api/v3/') or route not in routes:
                return self.reply({'error':'not found','code':'not_found'},404)
            return self.reply(getattr(self.server.storage,routes[route])(d))
        except ServiceError as e:
            response={'error':str(e),'code':e.code}
            if hasattr(e,'retry_after_ms'):response['retryAfterMs']=e.retry_after_ms
            if e.code in ('quota_exhausted','date_rollback','lease_lost','other_page_active'):
                try: response['state']=self.server.storage.state()
                except Exception: pass
            return self.reply(response,e.status)
        except (ValueError,TypeError): return self.reply({'error':'请求内容无效','code':'invalid_request'},400)
        except Exception: return self.reply({'error':'本机保存暂未确认，请大人帮一下','code':'storage_failed'},500)

# The page checks every theme asset with parallel HEAD requests; the default
# listen backlog of 5 makes macOS reset the overflow and the theme refuses to open.
ThreadingHTTPServer.request_queue_size=128

def make_server(db=DB,port=8765):
    # Bind first: a second launch must not migrate the DB while the old server owns the port.
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    try:
        if Path(db).exists() and Path(db).stat().st_size:
            from verify_migration import inspect_migration
            result=inspect_migration(db)
            if result['status']!='passed':
                raise ServiceError('migration_preflight_failed','数据库副本验证未通过，原库未升级')
        content_root=ROOT/'static'/'content'
        catalog=json.loads((content_root/'catalog.json').read_text(encoding='utf-8'))
        server.storage=Storage(db,content_root,limits_enabled=catalog.get('mode')!='development')
    except Exception:
        server.server_close()
        raise
    return server

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--db',type=Path,default=DB)
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    server=make_server(args.db,args.port)
    print('Momo Planet: http://127.0.0.1:'+str(server.server_address[1]),flush=True)
    if server.storage.backup_path: print('Database backup: '+server.storage.backup_path,flush=True)
    try: server.serve_forever()
    finally: server.server_close()
