(async()=>{
globalThis.nativeCapture=async(id,details)=>{const current=cdp;cdp=null;try{return await capture(id,details)}finally{cdp=current}};
globalThis.uiTree=async()=>{await shell('uiautomator','dump','/sdcard/clipp-study-ui.xml');return shell('cat','/sdcard/clipp-study-ui.xml')};
globalThis.nativeText=async(text)=>{const xml=await uiTree();const nodes=[...xml.matchAll(/<node[^>]+>/g)].map(m=>m[0]);const node=nodes.find(n=>n.includes('text="'+text+'"'));if(!node)throw Error('Native text absent: '+text);const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);await shell('input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));await sleep(700)};
globalThis.ensureDrawer=async()=>{if(!await evaluate("!!document.querySelector('.drawer-pane')"))await evaluate("document.querySelector('.app-logo').click()");await evaluate("document.querySelector('.drawer-pane').scrollTop=0");await sleep(700)};
globalThis.domText=async(t)=>evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(t)});if(!e)throw Error('Missing button '+${JSON.stringify(t)});e.click()})()`);
globalThis.foreground=async()=> (await shell('dumpsys','activity','activities')).split('\n').filter(l=>/topResumedActivity|mResumedActivity/.test(l));
globalThis.returnApp=async()=>{await shell('am','start','-n',pkg+'/com.clipp.app.MainActivity');await sleep(2500);await connect();await findClient()};

})();
