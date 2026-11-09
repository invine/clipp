from pathlib import Path
import json,hashlib,subprocess,re,datetime,html
D=Path(__file__).resolve().parent;R=D.parents[2]
raw=[json.loads(l) for l in (D/'observations.jsonl').read_text().splitlines()]
last={r['evidenceId']:r for r in raw}
annotations={
'native-launch-screen':'Initial launch frame; no DOM geometry.',
'native-drawer-bottom':'Early screenshot may precede drawer scroll; use native-continuity-clean-bottom.',
'native-reopen-after-back':'Early frame after document recreation; use clean Back repeat.',
'native-rename-keyboard':'Focused rename field, but screenshot does not show a keyboard. Use native-font-2-rename-keyboard for verified IME.',
'native-rename-keyboard-dismissed':'Preceding keyboard was not visually established; not evidence of keyboard dismissal.',
'native-qr-360':'ANR dialog overlays QR. Excluded from QR usability claims.',
'native-qr-verified':'Despite the exploratory filename, the screenshot retains a clipped native surface immediately after leaving freeform mode. Excluded from portrait QR conclusions. Use native-qr-landscape only for the separately verified landscape case.',
'native-qr-landscape':'Real generated QR; modal scroll height 435px versus 326px client height. The initial visible region crops the QR. No camera decoding or scroll-to-code qualification was performed.',
'native-back-from-qr':'ANR affected this trial. No independent QR Back conclusion.',
'native-qr-after-return':'ANR affected this trial; use clean lifecycle/QR observations.',
'native-stable-drawer-before-back':'Despite exploratory label, ANR dialog was active. Excluded.',
'native-stable-back-drawer':'ANR active. Excluded from Back behavior.',
'native-stable-back-return':'ANR active. Not proof drawer survives a normal return.',
'native-stable-continuity-controls':'ANR overlay active; use native-continuity-clean-bottom.',
'native-stable-back-second':'ANR active. Excluded.',
'native-notification-shade':'Captured while shade animation was incomplete. Use native-notification-expanded.',
'native-notification-paused':'Notification collapsed after Pause; use native-notification-paused-expanded.',
'native-notification-entry':'Synthetic notification tap had no real pending request; not proof of approval routing.',
'native-diagnostics-sharesheet':'Early frame predates chooser; use native-export-chooser-settled.',
'native-camera-permission':'Exploratory filename reused. Final image is a crash dialog, not a permission dialog. See camera-crash-log.txt; original provider trial failed.',
'native-camera-after-share-back':'Launcher frame after exploratory flow; not camera evidence.',
'fallback-camera-entry':'Early frame precedes the actual permission dialog; use fallback-camera-permission-prompt.',
'api31-drawer':'Screenshot preceded drawer composition; use api31-bottom for visible navigation.',
'api36-empty':'System UI ANR in concurrently running Android 16 emulator. Excluded; use separate retry if present.',
'api36-empty-retry':'Separate fresh Android 16 retry still showed a System UI ANR. Excluded; not an app-layout or API 36 usability pass.',
'api36-drawer-retry':'System UI ANR overlays the app. Excluded from API 36 usability claims.',
'api36-bottom-retry':'System UI ANR overlays the app. Excluded from API 36 usability claims; comparison emulator was closed.',
'native-size-600x800':'Measured during history reload; use navigation/bottom or settled replacement, not a density count.',
'native-size-1200x800':'Screenshot shows unfinished history composition. Use native-tablet-history-settled.',
'native-size-1200x800-navigation':'Transition/duplicate wide capture; use native-tablet-history-settled.',
'native-font-2-history':'Drawer was still open after changing font scale; use native-font-2-history-settled.',
'native-font-2-relay-keyboard':'Focus stayed in rename input. Wrong target; no relay keyboard conclusion.',
'native-font-2-endpoint-keyboard':'Focus stayed in rename input. Wrong target; no endpoint keyboard conclusion.',
'native-font-2-pairing-keyboard':'Stale/disconnected document in this attempt. Not a native Pairing keyboard pass.',
'native-selected-text-ingress':'Immediate state probe was false; later ingress trace and native-cutout-portrait confirm the Clip was accepted. No delivery/latency claim.',
'native-freeform-attempt':'Document connection was stale after window mode change. Use native-freeform-settled and native-freeform-short.',
'native-export-chooser-settled':'The real chooser reports no installed app can handle JSON in this AOSP image; no recipient or external sharing occurred.',
'fallback-camera-return-home':'Home probe reported visibility inconsistently; track retention is not evidence of background camera capture.'}
(D/'capture-annotations.json').write_text(json.dumps(annotations,indent=2)+'\n')
exclude=set(annotations)-{'native-launch-screen','native-camera-permission','native-notification-entry','native-selected-text-ingress','native-export-chooser-settled','fallback-camera-return-home','native-notification-paused','native-qr-landscape'}
ledger=[]
for id,r in last.items():
 g=r.get('geometry') or {};ok=not (id in exclude)
 ledger.append({'evidenceId':id,'timestampUtc':r['timestampUtc'],'runtime':'android','surface':'native app / wrapper','evidenceClass':r['evidenceClass'],'scenario':r.get('scenario'),'viewportCss':g.get('inner'),'visualViewport':g.get('visualViewport'),'devicePixelRatio':g.get('dpr'),'physicalPixels':r['physicalPixels'],'displaySize':r.get('displaySize'),'density':r.get('density'),'fontScale':r.get('fontScale'),'navigationMode':r.get('navigationMode'),'rotation':r.get('rotation'),'api':r.get('api',35),'screenshot':r['screenshot'],'status':'observed-with-limitations' if id in annotations and ok else 'excluded-from-claims' if not ok else 'captured','annotation':annotations.get(id),'interpretation':'Use android-observations.md for actual-versus-expected findings; captured does not mean a pass.','rawMeasurement':'observations.jsonl','sourceVersion':'source-build-receipt.json'})
(D/'evidence.jsonl').write_text('\n'.join(json.dumps(x) for x in ledger)+'\n')
finding_count=len(re.findall(r'^### A\d+ —', (D.parent/'android-observations.md').read_text(),re.M))
summary={'captureAttempts':len(raw),'uniqueImages':len(last),'nativeRecords':sum(x['evidenceClass']=='native-isolated' for x in ledger),'fixtureRecords':sum(x['evidenceClass']=='rendered-fixture' for x in ledger),'excludedImages':sum(x['status']=='excluded-from-claims' for x in ledger),'findings':finding_count}
(D/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
# Static portable gallery: no network, assets stay adjacent, search + evidence filters.
head='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clipp Android UX evidence</title><style>body{font:16px system-ui,sans-serif;background:#10131c;color:#edf0f6;margin:0;padding:24px}header{max-width:1100px;margin:auto}a{color:#b9a3ff}h1{font-size:30px}p{line-height:1.5}input,select{font:inherit;padding:10px;margin:6px 10px 12px 0;max-width:90%}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:20px;margin-top:20px}article{background:#1b2030;border:1px solid #39415b;border-radius:12px;padding:16px;min-width:0}h2{font-size:17px;overflow-wrap:anywhere}.meta{color:#abb7cb;font-size:13px}.note{border-left:3px solid #ffba6a;padding:8px;background:#37291f;font-size:14px}img{display:block;width:100%;height:470px;object-fit:contain;background:#090b10;border-radius:6px}.excluded{opacity:.65}[hidden]{display:none!important}</style><header><h1>Clipp · Android UX evidence</h1><p>Native emulator observations and labelled public-state/camera-capability fixtures. Read the <a href="../android-observations.md">report</a> for findings and limitations. A capture is not a usability pass.</p>'''
head+=f'<p>{summary["captureAttempts"]} capture attempts · {summary["uniqueImages"]} retained images · {summary["excludedImages"]} excluded images · {finding_count} findings</p>'
head+='<label>Search <input id="q" type="search" placeholder="keyboard, recovery, 320…"></label><label>Evidence <select id="kind"><option value="">All evidence</option><option>native-isolated</option><option>rendered-fixture</option></select></label><label><input type="checkbox" id="excluded">Show excluded captures</label><p id="count"></p></header><main>'
parts=[]
for r in ledger:
 id=r['evidenceId'];excluded=r['status']=='excluded-from-claims';g=last[id].get('geometry') or {};v=r['viewportCss'];vp=f'{v["w"]} × {v["h"]} CSS' if v else 'Native frame; no qualified DOM geometry';note=r['annotation'];text=f'{id} {r["scenario"]} {note or ""}'
 parts.append(f'<article data-kind="{r["evidenceClass"]}" data-excluded="{str(excluded).lower()}" data-search="{html.escape(text.lower(),quote=True)}" class="{"excluded" if excluded else ""}"><h2>{html.escape(id)}</h2><p class="meta">{html.escape(r["evidenceClass"])} · {vp} · DPR {r["devicePixelRatio"] or "—"} · font {r["fontScale"]}</p><p>{html.escape(r["scenario"] or "")}</p>'+ (f'<p class="note">{html.escape(note)}</p>' if note else '')+f'<a href="{r["screenshot"]}"><img loading="lazy" src="{r["screenshot"]}" alt="{html.escape(r["scenario"] or id,quote=True)}"></a></article>')
script='''</main><script>const q=document.querySelector('#q'),kind=document.querySelector('#kind'),excluded=document.querySelector('#excluded'),cards=[...document.querySelectorAll('article')];function filter(){let n=0;for(const c of cards){let show=(!kind.value||c.dataset.kind===kind.value)&&(!q.value||c.dataset.search.includes(q.value.toLowerCase()))&&(excluded.checked||c.dataset.excluded!=='true');c.hidden=!show;if(show)n++}document.querySelector('#count').textContent=n+' images shown'}for(const e of [q,kind,excluded])e.addEventListener('input',filter);filter()</script></html>'''
(D/'index.html').write_text(head+'\n'.join(parts)+script)
# Exact source and build receipt; no private runtime state.
b=json.loads((D.parent/'inventory-source-baseline.json').read_text());files=b.get('files',b.get('sources',[]));changes=[]
for x in files:
 p=R/x['path'];h=hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
 if h!=x['sha256']:changes.append(x['path'])
def git(*a):return subprocess.check_output(['git',*a],cwd=R,text=True).strip()
apk=R/'apps/android/android/app/build/outputs/apk/acceptance/app-acceptance.apk'
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'clientDate':'2026-10-08','head':git('rev-parse','HEAD'),'branch':git('branch','--show-current'),'status':git('status','--short'),'inventorySourceCount':len(files),'inventorySourceChanges':changes,'builds':[{'command':'npm --workspace apps/android run build','result':'passed'},{'command':'npm --workspace apps/android run cap:sync','result':'passed'},{'command':'JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew -I ../scripts/native-acceptance.init.gradle -PclippAcceptance :app:assembleAcceptance','cwd':'apps/android/android','result':'BUILD SUCCESSFUL; 116 tasks'}],'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'apkRelativePath':str(apk.relative_to(R)),'productionEdits':False,'commitCreated':False}
(D/'source-build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'summary':summary,'sourceCount':len(files),'changedSources':changes}))
