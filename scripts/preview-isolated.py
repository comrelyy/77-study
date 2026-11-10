"""Manual browser QA server; temporary database, never the household database."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import make_server

if __name__ == '__main__':
    server = make_server(port=8766, preview=True)
    print('Isolated preview: http://127.0.0.1:8766 ; temporary database', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
