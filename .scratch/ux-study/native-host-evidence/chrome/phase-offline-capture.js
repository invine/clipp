(async()=>{
 const ts=await browserCDP.send('Target.getTargets');const t=ts.targetInfos.find(t=>t.url===`chrome-extension://${extensionId}/src/popup.html`);
 if(!t)throw Error('Offline popup target absent');popupTarget=t;popup=await attach(t.targetId);
 await popup.send('Runtime.enable');await popup.send('Page.enable');
 const view=await peval(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,fontAvailable:document.fonts.check('24px "Material Symbols Rounded"'),icons:[...document.querySelectorAll('.material-symbols-rounded')].map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,font:getComputedStyle(e).fontFamily})),guard:!!globalThis.__uxClipboard,ready:document.readyState})`);
 const image=await popup.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(dir,'cold-offline-popup.png'),Buffer.from(image.data,'base64'));
 const record={id:'cold-offline-popup',at:new Date().toISOString(),networkOffline:true,cacheClearedInFreshTestProfile:true,nativePopup:true,fixtureResponses:false,view,screenshot:'cold-offline-popup.png'};
 await fs.appendFile(path.join(dir,'observations.jsonl'),JSON.stringify(record)+'\n');out(record);
 await browserCDP.send('Target.detachFromTarget',{sessionId:popup.sessionId});
})();
