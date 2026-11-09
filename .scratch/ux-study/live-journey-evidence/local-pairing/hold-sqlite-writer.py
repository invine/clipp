# Induce real SQLite contention only in the explicitly owned disposable study DB.
from pathlib import Path
import json,sqlite3,sys
root=Path(__file__).resolve().parent
profile=Path(json.loads((root/'electron-environment.json').read_text())['profile'])
assert profile.name.startswith('clipp-ux-local-pairing-electron-')
conn=sqlite3.connect(profile/'clipp.sqlite',timeout=2)
conn.execute('BEGIN IMMEDIATE')
print(json.dumps({'writerLockHeld':True,'profile':str(profile),'databaseRead':False,'databaseChanged':False}),flush=True)
sys.stdin.readline()
conn.rollback();conn.close()
print(json.dumps({'writerLockReleased':True}),flush=True)
