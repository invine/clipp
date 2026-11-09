const fs=require('node:fs/promises'),syncfs=require('node:fs'),path=require('node:path'),readline=require('node:readline'),cp=require('node:child_process'),{promisify}=require('node:util');
const execFile=promisify(cp.execFile), dir=__dirname,root=path.resolve(dir,'../../..');
const serial='emulator-5580',pkg='com.clipp.app.acceptance';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const adb=async(...args)=>(await execFile('/opt/homebrew/bin/adb',['-s',serial,...args],{maxBuffer:24*1024*1024})).stdout;
const shell=(...args)=>adb('shell',...args);
const out=x=>{const s=JSON.stringify(x);syncfs.appendFileSync(path.join(dir,'trace.jsonl'),s+'\n');console.log(s)};
let ws,cdp,pageTarget,measureSource;
async function connect(){
 const pid=(await shell('pidof',pkg)).trim();if(!pid)throw Error('acceptance process absent');
 await adb('forward','tcp:9226','localabstract:webview_devtools_remote_'+pid);
 const targets=await (await fetch('http://127.0.0.1:9226/json',{signal:AbortSignal.timeout(8000)})).json();pageTarget=targets.find(t=>t.type==='page');if(!pageTarget)throw Error('WebView page absent');
 if(ws)ws.close();ws=new WebSocket(pageTarget.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WebSocket open timeout')),8000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});ws.addEventListener('error',reject,{once:true})});let id=0;const pending=new Map();
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}});
 cdp=(method,params={})=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},15000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}))});
 await cdp('Runtime.enable');await cdp('Page.enable');out({connected:pageTarget.url,pid,dimensions:await evaluate('({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,userAgent:navigator.userAgent})')});
}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
async function capture(id,details={}){
 await sleep(1400);const geometry=cdp?await evaluate(measureSource).catch(e=>({error:String(e)})):null;
 const png=(await execFile('/opt/homebrew/bin/adb',['-s',serial,'exec-out','screencap','-p'],{encoding:null,maxBuffer:24*1024*1024})).stdout;await fs.writeFile(path.join(dir,id+'.png'),png);
 const windows=await shell('dumpsys','window','windows');await fs.writeFile(path.join(dir,id+'-windows.txt'),windows);
 const record={evidenceId:id,timestampUtc:new Date().toISOString(),runtime:'android',evidenceClass:'native-isolated',...details,serial,package:pkg,geometry,screenshot:id+'.png',physicalPixels:{width:png.readUInt32BE(16),height:png.readUInt32BE(20)},fontScale:(await shell('settings','get','system','font_scale')).trim(),displaySize:(await shell('wm','size')).trim(),density:(await shell('wm','density')).trim(),rotation:(await shell('settings','get','system','user_rotation')).trim(),navigationMode:(await shell('settings','get','secure','navigation_mode')).trim()};
 await fs.appendFile(path.join(dir,'observations.jsonl'),JSON.stringify(record)+'\n');out({capture:id,viewport:geometry?.inner,physicalPixels:record.physicalPixels,fontScale:record.fontScale});return record;
}
async function domTap(selector){const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing selector');const r=e.getBoundingClientRect();return{x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio}})()`);await shell('input','tap',String(Math.round(r.x)),String(Math.round(r.y)));await sleep(400)}
async function quit(){if(ws)ws.close();await shell('am','force-stop',pkg);await adb('forward','--remove','tcp:9226');await adb('emu','kill');await fs.writeFile(path.join(dir,'closed.json'),JSON.stringify({closed:true,at:new Date().toISOString(),serial,package:pkg}));process.exit(0)}
(async()=>{
 await adb('wait-for-device');out({boot:(await shell('getprop','sys.boot_completed')).trim(),sdk:(await shell('getprop','ro.build.version.sdk')).trim(),devices:await adb('devices','-l')});
 measureSource='(()=>{'+await fs.readFile(path.join(root,'.scratch/ux-study/extension-evidence/measure.js'),'utf8')+'\nreturn measure()})()';
 const rl=readline.createInterface({input:process.stdin,terminal:false});let chain=Promise.resolve();rl.on('line',line=>{chain=chain.then(async()=>{try{const r=await eval('(async()=>{'+line+'})()');if(r!==undefined)out(r)}catch(e){out({error:e.stack})}out({commandDone:true})})});
})().catch(e=>{out({launchError:e.stack});process.exitCode=1});
