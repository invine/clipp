# Run only after the owned Electron process has closed normally.
from pathlib import Path
import json,sqlite3,datetime,os
root=Path(__file__).resolve().parent
assert json.loads((root/'electron-closed.json').read_text())['closed']
profile=Path(json.loads((root/'electron-environment.json').read_text())['profile'])
assert profile.name.startswith('clipp-ux-native-continuation-')
conn=sqlite3.connect(profile/'clipp.sqlite')
backup=sqlite3.connect(profile/'pre-identity-loss.sqlite');conn.backup(backup);backup.close();os.chmod(profile/'pre-identity-loss.sqlite',0o600)
# Do not SELECT or export stored identity/key values. Replace the private-key field in place.
result=conn.execute("UPDATE kv SET value=json_set(value, '$.privateKey', 'synthetic-invalid-private-key') WHERE key='localDeviceIdentity'")
assert result.rowcount==1
conn.commit();conn.close()
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Only owned disposable study SQLite','changedRows':1,'change':'Replace privateKey field with synthetic invalid bytes','originalKeyReadOrExported':False,'privateSnapshot':'Inside same disposable profile; not exported','expected':'Actual Identity Loss path, automatic new identity, local history deletion and fresh-Pairing notice'}
(root/'identity-fault-setup.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
