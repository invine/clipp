(async()=>{
globalThis.measureSource='(()=>{'+(await fs.readFile(path.join(dir,'measure.js'),'utf8'))+'\nreturn measure()})()';
globalThis.capture=async function(id,surface,details={}){
 await sleep(200);let geometry,png;
 if(surface==='popup'){geometry=await peval(measureSource);png=Buffer.from((await popup.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true})).data,'base64')}
 else{geometry=await options.evaluate(measureSource);png=await options.screenshot({fullPage:false})}
 await fs.writeFile(path.join(dir,id+'.png'),png);
 const record={evidenceId:id,timestampUtc:new Date().toISOString(),surface,evidenceClass:'native-isolated',...details,geometry,screenshot:id+'.png'};
 await fs.appendFile(path.join(dir,'observations.jsonl'),JSON.stringify(record)+'\n');out({capture:id,surface,viewport:geometry.inner,cards:geometry.cards});return record;
};
globalThis.message=async m=>options.evaluate(msg=>chrome.runtime.sendMessage(msg),m);
globalThis.sizeOptions=async(w,h)=>{await options.setViewportSize({width:w,height:h});await sleep(200)};
out({initial:await message({type:'getRuntimeState'}),settings:await message({type:'getSettings'}),clipboardGuard:await options.evaluate(()=>!!globalThis.__uxClipboard)});
await capture('options-native-empty','options',{scenario:'Initial options tab'});
await openPopup();await capture('popup-native-empty','popup',{scenario:'Actual toolbar popup initial state'});
out({popupViews:await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['POPUP']})),popupBody:await peval('document.body.innerText')});
})();
