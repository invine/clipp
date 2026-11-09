(async()=>{
 const before=(await realMessage({type:'getRuntimeState'})).state;
 const oldContexts=await options.evaluate(()=>chrome.runtime.getContexts({contextTypes:['BACKGROUND','OFFSCREEN_DOCUMENT']}));
 await context.close();out({case:'browser-restart-closed',closed:true});
 context=await chromium.launchPersistentContext(profile,{headless:false,viewport:null,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`,'--window-size=1100,820']});
 worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker',{timeout:15000});
 browserCDP=await context.browser().newBrowserCDPSession();
 options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/src/options.html`);await options.waitForSelector('h1');
 globalThis.realMessage=m=>options.evaluate(m=>chrome.runtime.sendMessage(m),m);
 globalThis.nativeRecord=async(id,extra={})=>{const record={id,at:new Date().toISOString(),windows:await options.evaluate(()=>chrome.windows.getAll()),view:await options.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,screen:{width:screen.width,height:screen.height},scrollWidth:document.documentElement.scrollWidth})),...extra};await options.screenshot({path:path.join(dir,id+'.png')});await fs.appendFile(path.join(dir,'observations.jsonl'),JSON.stringify(record)+'\n');out(record);return record};
 const after=(await realMessage({type:'getRuntimeState'})).state;
 const settings=await realMessage({type:'getSettings'});
 const newContexts=await options.evaluate(()=>chrome.runtime.getContexts({contextTypes:['BACKGROUND','OFFSCREEN_DOCUMENT']}));
 const result={case:'browser-restart',sameIsolatedProfile:true,oldContextsGone:oldContexts.every(o=>!newContexts.some(n=>n.contextId===o.contextId)),identityPreserved:before.identity.deviceId===after.identity.deviceId,clipsBefore:before.clips.length,clipsAfter:after.clips.length,autoSync:after.autoSync,visibleAutoSync:await options.getByLabel('Auto-sync',{exact:true}).isChecked(),guardedClipboard:await options.evaluate(()=>!!globalThis.__uxClipboard),captureRecurrenceQualified:false};
 await nativeRecord('browser-restarted',result);
})();
