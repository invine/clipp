ws.close();
const endpoint=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
ws=new WebSocket(`ws://127.0.0.1:${endpoint[0]}${endpoint[1]}`);
await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}});
out({case:'observer-reconnected-after-wall-clock-gap',targets:await targets()});
out({case:'public-state-after-native-wake',state:await readOptions(`(async()=>{const {state}=await chrome.runtime.sendMessage({type:'getRuntimeState'});return {clips:state.clips.length,devices:state.devices.length,relays:state.managedRelayConfigurations.length,autoSync:state.autoSync,guard:!!globalThis.__uxClipboard}})()`)});
await quit();
