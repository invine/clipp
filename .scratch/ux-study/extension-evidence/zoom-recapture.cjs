const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const dir=__dirname, sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
const env=JSON.parse(await fs.readFile(path.join(dir,'environment.json'),'utf8'));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'clipp-ux-chrome-zoom-profile-'));
const extensionPath=await fs.mkdtemp(path.join(os.tmpdir(),'clipp-ux-chrome-zoom-build-'));
await fs.cp(env.extensionPath,extensionPath,{recursive:true});
const fixture=JSON.parse(await fs.readFile(path.join(dir,'fixtures.json'),'utf8')).typical;
await fs.writeFile(path.join(extensionPath,'ux-fixture-state.js'),'globalThis.__uxFixtureState='+JSON.stringify(fixture)+';');
const html=path.join(extensionPath,'src/options.html');await fs.writeFile(html,(await fs.readFile(html,'utf8')).replace('<head>','<head><script src="/ux-fixture-state.js"></script><script src="/ux-fixture-bridge.js"></script>'));
const context=await chromium.launchPersistentContext(profile,{headless:false,viewport:null,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`,'--window-size=1100,820']});
try{
const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
const extensionId=await worker.evaluate(()=>chrome.runtime.id);
const page=await context.newPage();await page.goto(`chrome-extension://${extensionId}/src/options.html`);await page.waitForSelector('h1');await page.bringToFront();
const cdp=await context.newCDPSession(page);const measure='(()=>{'+await fs.readFile(path.join(dir,'measure.js'),'utf8')+'\nreturn measure()})()';
const tabId=await page.evaluate(async()=> (await chrome.tabs.getCurrent()).id);
await fs.writeFile(path.join(dir,'zoom-environment.json'),JSON.stringify({timestamp:new Date().toISOString(),profile,extensionPath,extensionId,browser:context.browser().version(),method:'Raw CDP Page.captureScreenshot; new isolated profile, same build, synthetic UI responses, clipboard guard',screen:await page.evaluate(()=>({width:screen.width,height:screen.height,dpr:devicePixelRatio}))},null,2));
for(const factor of [1,1.25,1.5,2]){
await worker.evaluate(async p=>chrome.tabs.setZoom(p.tabId,p.factor),{tabId,factor});await sleep(250);
for(const end of ['top','bottom']){
await page.evaluate(end=>scrollTo(0,end==='top'?0:document.documentElement.scrollHeight),end);await sleep(200);
const geometry=await page.evaluate(measure);const png=Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true})).data,'base64');const id='options-zoom-cdp-'+factor+'-'+end;
await fs.writeFile(path.join(dir,id+'.png'),png);await fs.appendFile(path.join(dir,'observations.jsonl'),JSON.stringify({evidenceId:id,timestampUtc:new Date().toISOString(),surface:'options',evidenceClass:'rendered-fixture',scenario:'Replacement native Chrome zoom screenshot, '+end,zoomFactor:factor,captureMethod:'CDP Page.captureScreenshot',environmentOverride:'zoom-environment.json',geometry,screenshot:id+'.png'})+'\n');
console.log(JSON.stringify({id,viewport:geometry.inner,dpr:geometry.dpr,png:{w:png.readUInt32BE(16),h:png.readUInt32BE(20)}}));
}
}
}finally{await context.close();await fs.writeFile(path.join(dir,'zoom-closed.json'),JSON.stringify({closed:true,at:new Date().toISOString()}));}
})().catch(e=>{console.error(e);process.exitCode=1});
