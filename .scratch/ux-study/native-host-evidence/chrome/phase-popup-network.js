(async()=>{
 popup=await attach(popupTarget.targetId);await popup.send('Network.enable');await popup.send('Page.enable');
 await popup.send('Network.clearBrowserCache');await popup.send('Network.setCacheDisabled',{cacheDisabled:true});
 await popup.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await popup.send('Page.reload',{ignoreCache:true});await sleep(700);
 const view=await peval(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,online:navigator.onLine,fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),icons:[...document.querySelectorAll('.icon')].map(e=>({text:e.textContent,width:e.getBoundingClientRect().width})),guard:!!globalThis.__uxClipboard})`);
 const image=await popup.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(dir,'offline-popup-verified.png'),Buffer.from(image.data,'base64'));
 const record={id:'offline-popup-verified',at:new Date().toISOString(),networkBoundary:'Actual popup CDP offline; cache disabled; renderer reloaded',nativePopup:true,appResponseFixtures:false,view,screenshot:'offline-popup-verified.png'};
 await fs.appendFile(path.join(dir,'observations.jsonl'),JSON.stringify(record)+'\n');out(record);
 await popup.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await context.setOffline(false);
 await browserCDP.send('Target.detachFromTarget',{sessionId:popup.sessionId});
})();
