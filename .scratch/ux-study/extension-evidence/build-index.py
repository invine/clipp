"""Derive a readable evidence index from retained observations; no app mutation."""
from pathlib import Path
import json, re, struct, html

directory = Path(__file__).resolve().parent
report = (directory.parent / 'extension-observations.md').read_text()
rows = [json.loads(line) for line in (directory / 'observations.jsonl').read_text().splitlines()]
receipt = json.loads((directory / 'source-build-receipt.json').read_text())
environment = json.loads((directory / 'environment.json').read_text())
annotations = {
    'popup-fixture-qr-failure-confirmed': 'Mislabeled intermediate capture: failure injection had been removed. Shows a successful QR, not an error. Use popup-fixture-qr-error-verified for the failure claim.',
    'options-native-fullscreen': 'Taken during the fullscreen transition. Excluded from settled bounds; use options-native-fullscreen-settled and the report limitation.',
    'popup-fixture-stacked-recovery': 'Adversarial simultaneous error fixture; not evidence that all these states co-occur natively.',
    'popup-fixture-pending-overflow': 'Text glyphs extend beyond constrained Peer ID boxes; box-only overflow checks miss this. Relay actions were reachable.',
    'options-native-invalid-settings': 'Real background validation, but 480×640 options viewport/DPR 1 is emulated.',
}
for row in rows:
    key = row['evidenceId']
    if ('options-native-zoom-' in key or 'options-fixture-native-zoom-' in key) and not key.endswith('-1') and not key.endswith('-1-bottom'):
        annotations[key] = 'Unsuitable zoom screenshot: Playwright capture crops or blanks the viewport. DOM geometry retained. Use options-zoom-cdp-* replacements for visual conclusions.'
    if row['surface'] == 'popup' and 'native-zoom-' in key:
        annotations[key] = 'Tab zoom setting did not affect this native popup: actual viewport 480×600 and DPR 2. Not an enlarged-popup test.'
(directory / 'capture-annotations.json').write_text(json.dumps(annotations, indent=2) + '\n')

findings = []
for match in re.finditer(r'### (C\d+) — (.*?) · (High|Medium)\n\n(.*?)(?=\n### |\n## |\Z)', report, re.S):
    key, title, priority, body = match.groups()
    images = re.findall(r'extension-evidence/([^/)]+)\.png', body)
    sources = ['../'+s for s in re.findall(r'\]\((\.\./\.\./[^)]+)\)', body)]
    expected = re.search(r'Expected: (.*?)(?= \[|\n|\*\*Confidence)', body)
    findings.append({'id':key,'title':title,'priority':priority,'evidenceIds':images,'sourcePointers':sources,'expectedAndProposal':expected.group(1).strip() if expected else '', 'detail':body.strip()})
(directory / 'findings.json').write_text(json.dumps(findings, indent=2, ensure_ascii=False) + '\n')

positive = {'popup-fixture-qr-error-verified','popup-fixture-last-clip','popup-fixture-dense-relays','options-native-clear-after-reload'}
normalized = []
for row in rows:
    key = row['evidenceId']; geometry = row['geometry']
    linked = [f for f in findings if key in f['evidenceIds']]
    invalid = key == 'popup-fixture-qr-failure-confirmed' or 'Unsuitable zoom' in annotations.get(key, '') or key == 'options-native-fullscreen'
    zoom = row.get('zoomFactor', 1)
    dpr = geometry['dpr']
    limitations = list(row.get('limitations', []))
    if key in annotations: limitations.append(annotations[key])
    if row['evidenceClass'] == 'rendered-fixture': limitations.append('Synthetic public UI responses; no qualification of real Pairing, network, auth or persistence failures.')
    if row['surface'] == 'popup': limitations.append('Native POPUP host inspected with CDP; attached inspection changes click-away/Escape lifecycle. Separate detached checks establish dismissal.')
    if row['surface'] == 'options' and dpr == 1: limitations.append('Viewport/DPR emulation on the native DPR 2 display; not another physical display.')
    if 'fullscreen' in key: limitations.append('Chrome fullscreen state reported, but measured bounds did not fill the physical display.')
    if row.get('environmentOverride'): limitations.append('Second disposable profile; see zoom-environment.json.')
    size = struct.unpack('>II', (directory / row['screenshot']).read_bytes()[16:24])
    normalized.append({
        'evidenceId':key,'scenario':row.get('scenario',key),'fixture':'Public response fixture' if row['evidenceClass']=='rendered-fixture' else 'Native runtime with synthetic local data and clipboard boundary guard',
        'runtime':'chrome-extension','surface':'native-toolbar-popup' if row['surface']=='popup' else 'options-tab','timestampUtc':row['timestampUtc'],
        'source':{'head':receipt['head'],'diffSha256':receipt['trackedDiffSha256'],'manifest':'source-build-receipt.json','build':receipt['buildCommand']},
        'environment':{'os':'Darwin '+environment['os'],'runtimeVersion':environment['browser'],'isolation':row.get('environmentOverride','environment.json'),'input':'CDP/Playwright pointer, keyboard and documented event/action seams; see phase scripts',
            'windowMode':'fullscreen-reported' if 'fullscreen' in key else 'maximized' if 'maximized' in key else 'popup' if row['surface']=='popup' else 'restored-or-emulated',
            'outerBounds':geometry['outer'],'contentBounds':geometry['inner'],'viewportCss':geometry['inner'],'visualViewport':geometry['visualViewport'],'physicalResolution':None,'dpr':dpr,'displayScale':2,'pageZoom':1 if row['surface']=='popup' else zoom,'fontScale':None,'androidWindowDp':None,'systemInsets':None,'keyboardInsets':None},
        'preconditions':['New isolated Chrome profile; empty relays; memory clipboard','Production built JS/CSS preserved'],
        'steps':['Use the linked finding reproduction in ../extension-observations.md and the named phase scripts in README.md.'],
        'expected': 'Capture the actual rendered viewport/state and its geometry; specific proposed UX criteria live in linked findings.',
        'actual':f"Viewport {geometry['inner']['w']}×{geometry['inner']['h']}; DPR {dpr}; {geometry['cards']['full']} complete shared history cards. "+annotations.get(key,''),
        'outcome':'blocked' if invalid else 'fail' if linked and key not in positive else 'pass',
        'outcomeScope':'Fail links to a documented UX finding; pass means bounded observation obtained, not full scenario acceptance. Blocked marks an unsuitable image/label retained for audit.',
        'evidenceClass':row['evidenceClass'],'artifacts':[row['screenshot'],'observations.jsonl','trace.jsonl'],
        'impact':'; '.join(f['title'] for f in linked) or 'Bounded measurement/comparison', 'confidence':'observed with stated seams',
        'sourcePointers':sorted(set(s for f in linked for s in f['sourcePointers'])) or ['../flow-control-inventory.md'],
        'recommendation':'Input to the later user control/layout decisions; no implementation approved.','findings':[f['id'] for f in linked],'limitations':limitations,
        'captureMethod':row.get('captureMethod','CDP Page.captureScreenshot' if row['surface']=='popup' else 'Playwright page.screenshot'),'captureSize':{'width':size[0],'height':size[1]}
    })
(directory / 'evidence.jsonl').write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in normalized))

cards=[]
for row, entry in zip(rows,normalized):
    key=row['evidenceId']; e=html.escape
    note=annotations.get(key,'')
    cards.append(f'''<article id="{e(key)}" data-kind="{e(row['evidenceClass'])}" data-surface="{e(row['surface'])}" data-findings="{' '.join(entry['findings'])}">
<h2><a href="{e(row['screenshot'])}">{e(key)}</a></h2><p>{e(row.get('scenario',key))}</p>
<p class="meta">{e(row['surface'])} · {e(row['evidenceClass'])} · {row['geometry']['inner']['w']}×{row['geometry']['inner']['h']} CSS · DPR {row['geometry']['dpr']} · {' / '.join(entry['findings']) or 'measurement'}</p>
{f'<p class="note">{e(note)}</p>' if note else ''}
<a href="{e(row['screenshot'])}"><img loading="lazy" src="{e(row['screenshot'])}" alt="{e(row.get('scenario',key))}"></a></article>''')
finding_options=''.join(f'<option value="{f["id"]}">{f["id"]}: {html.escape(f["title"])}</option>' for f in findings)
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clipp Chrome UX evidence</title>
<style>*{box-sizing:border-box}body{margin:0;background:#10151d;color:#eef2f9;font:15px/1.5 system-ui}header{padding:24px;max-width:1500px;margin:auto}h1{margin:0 0 8px}a{color:#9bc9ff}p{margin:8px 0}.controls{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}label{display:grid;gap:4px}input,select{background:#223045;color:#fff;border:1px solid #708197;border-radius:5px;padding:8px;font:inherit;max-width:400px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px;padding:0 24px 24px;max-width:1500px;margin:auto}article{background:#1b2533;border:1px solid #445367;padding:16px;border-radius:10px;min-width:0}h2{font-size:17px;overflow-wrap:anywhere;margin:0}img{display:block;max-width:100%;max-height:650px;margin:12px auto 0;object-fit:contain}.meta{color:#c3cfdf;font-size:13px}.note{background:#49380a;color:#fff0bf;padding:10px}article[hidden]{display:none}</style>
<header><h1>Clipp · Chrome UX evidence</h1><p>94 capture attempts · 16 findings · 7 October 2026</p><p><a href="../extension-observations.md">Read the report</a> · <a href="evidence.jsonl">Evidence ledger</a> · <a href="README.md">Methods and limits</a></p><p>The toolbar popup is real Chrome POPUP UI. Rendered fixtures replace public responses. Enlarged options screenshots marked unsuitable have direct-CDP replacements. Recommendations are not accepted decisions.</p>
<div class="controls"><label>Search<input id="search" placeholder="Search scenarios or evidence IDs"></label><label>Surface<select id="surface"><option value="">All surfaces</option><option>popup</option><option>options</option></select></label><label>Evidence<select id="kind"><option value="">All evidence</option><option>native-isolated</option><option>rendered-fixture</option></select></label><label>Finding<select id="finding"><option value="">All findings / measurements</option>'''+finding_options+'''</select></label></div><p id="count" aria-live="polite"></p></header><main class="grid">'''+''.join(cards)+'''</main>
<script>const controls=['search','surface','kind','finding'].map(id=>document.getElementById(id));function filter(){let n=0;for(const card of document.querySelectorAll('article')){const [q,s,k,f]=controls.map(c=>c.value);card.hidden=!!((q&&!card.textContent.toLowerCase().includes(q.toLowerCase()))||(s&&card.dataset.surface!==s)||(k&&card.dataset.kind!==k)||(f&&!card.dataset.findings.split(' ').includes(f)));if(!card.hidden)n++}document.getElementById('count').textContent=n+' captures shown'}for(const c of controls)c.addEventListener('input',filter);filter()</script></html>'''
(directory/'index.html').write_text(page)
assert len(findings)==16
assert len(rows)==94
assert all((directory/r['screenshot']).exists() for r in rows)
print(json.dumps({'captures':len(rows),'findings':len(findings),'annotations':len(annotations)}))
