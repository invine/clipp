(async()=>{
 globalThis.record=async(value)=>{await fs.appendFile(path.join(dir,'trace.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');out(value)};
 globalThis.nativeCapture=async(id,extra={})=>{
  let previous='',stable=0;for(let n=0;n<12;n++){const g=await geometry();const key=JSON.stringify({n:g.native,d:[g.dom.width,g.dom.height]});stable=key===previous?stable+1:0;previous=key;if(stable>=2)break;await sleep(250)}
  const shot=await electron.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  await fs.writeFile(path.join(dir,id+'.png'),Buffer.from(shot,'base64'));
  const value={id,at:new Date().toISOString(),geometry:await geometry(),screenshot:id+'.png',...extra};
  await fs.appendFile(path.join(dir,'observations.jsonl'),JSON.stringify(value)+'\n');out(value);
 };
 globalThis.closeOwned=async()=>{const owned=electron.process();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;owned.kill('SIGTERM')},10000);try{await electron.close()}finally{clearTimeout(timer)}await record({case:'electron-close',timedOut,exitCode:owned.exitCode,signal:owned.signalCode});if(timedOut)throw Error('Owned app failed normal shutdown')};
 globalThis.launchSame=async()=>{electron=await _electron.launch({args:[path.join(profile,'launch.cjs')],cwd:root,env:{...process.env,CLIPP_LOG_LEVEL:'error',CLIPP_RELAY_ACCEPTANCE_TRANSPORT:'wss',CLIPP_RELAY_ACCEPTANCE_PROFILE:profile},timeout:30000});page=await electron.firstWindow();await page.waitForFunction(()=>window.clipp?.getState);await sleep(500)};
 await record({case:'electron-baseline',clips:nativeBefore.clips.length,autoSync:nativeBefore.autoSync,privateStateExported:false});
 await nativeCapture('native-fullscreen',{input:'CUA native fullscreen button'});
})();
