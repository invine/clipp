const fs=require('node:fs/promises'),syncfs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),readline=require('node:readline');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../../..'),dir=__dirname;
let context,worker,options,browserCDP,profile,extensionPath,extensionId,popup,popupTarget;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function out(x){const s=JSON.stringify(x);syncfs.appendFileSync(path.join(dir,'trace.jsonl'),s+'\n');console.log(s)}
async function attach(targetId){
 const {sessionId}=await browserCDP.send('Target.attachToTarget',{targetId,flatten:false});let serial=0;const pending=new Map();
 const listener=e=>{if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id&&pending.has(m.id)){const {resolve,reject,timer}=pending.get(m.id);clearTimeout(timer);pending.delete(m.id);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)}};
 browserCDP.on('Target.receivedMessageFromTarget',listener);
 return {sessionId,send:(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},10000);pending.set(id,{resolve,reject,timer});browserCDP.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject)})};
}
async function peval(expression){const result=await popup.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result?.value}
async function openPopup(){
 await options.bringToFront();
 await worker.evaluate(async()=>{const w=(await chrome.windows.getAll()).find(w=>w.type==='normal');await chrome.windows.update(w.id,{focused:true})});await sleep(800);
 await worker.evaluate(async()=>{const w=(await chrome.windows.getAll()).find(w=>w.type==='normal');await chrome.action.openPopup({windowId:w.id})});await sleep(350);
 const targets=await browserCDP.send('Target.getTargets');popupTarget=targets.targetInfos.find(t=>t.url===`chrome-extension://${extensionId}/src/popup.html`);
 if(!popupTarget)throw Error('native_popup_target_missing');popup=await attach(popupTarget.targetId);await popup.send('Runtime.enable');await popup.send('Page.enable');await sleep(250);out({popupTarget,dimensions:await peval('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,guard:!!globalThis.__uxClipboard})')});
}
async function clickPopup(selector){const p=await peval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing selector');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await popup.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await popup.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await sleep(120)}
async function init(){
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'clipp-ux-chrome-profile-'));extensionPath=await fs.mkdtemp(path.join(os.tmpdir(),'clipp-ux-chrome-build-'));
 await fs.cp(path.join(root,'apps/extension/.local/relay-acceptance/wss'),extensionPath,{recursive:true});
 await fs.copyFile(path.join(dir,'clipboard-guard.js'),path.join(extensionPath,'ux-clipboard-guard.js'));
 for(const file of ['src/popup.html','src/options.html','offscreen.html']){const p=path.join(extensionPath,file);await fs.writeFile(p,(await fs.readFile(p,'utf8')).replace('<head>','<head><script src="/ux-clipboard-guard.js"></script>'))}
 context=await chromium.launchPersistentContext(profile,{headless:false,viewport:null,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`,'--window-size=1100,820']});
 worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker',{timeout:15000});extensionId=await worker.evaluate(()=>chrome.runtime.id);browserCDP=await context.browser().newBrowserCDPSession();
 options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/src/options.html`);await options.waitForSelector('h1');
 const environment={timestamp:new Date().toISOString(),profile,extensionPath,extensionId,browser:context.browser().version(),executable:chromium.executablePath(),os:os.release(),arch:os.arch(),isolation:'new profile; compiled WSS relay-only; clipboard boundary guarded in popup/options/offscreen',screen:await options.evaluate(()=>({width:screen.width,height:screen.height,availWidth:screen.availWidth,availHeight:screen.availHeight,dpr:devicePixelRatio})),windows:await worker.evaluate(()=>chrome.windows.getAll())};
 await fs.writeFile(path.join(dir,'environment.json'),JSON.stringify(environment,null,2));out({ready:true,environment});
}
async function quit(){await context.close();await fs.writeFile(path.join(dir,'closed.json'),JSON.stringify({at:new Date().toISOString(),closed:true}));out({closed:true});process.exit(0)}
process.on('unhandledRejection',e=>out({unhandled:String(e)}));
init().then(()=>{const rl=readline.createInterface({input:process.stdin,terminal:false});let chain=Promise.resolve();rl.on('line',line=>{chain=chain.then(async()=>{try{const r=await eval('(async()=>{'+line+'})()');if(r!==undefined)out(r)}catch(e){out({error:e.stack})}out({commandDone:true})})})}).catch(e=>{out({launchError:e.stack});process.exit(1)});
