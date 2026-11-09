(async()=>{
 const sw=await context.newCDPSession(options);const updates=[];
 sw.on('ServiceWorker.workerVersionUpdated',e=>updates.push(...e.versions));
 await sw.send('ServiceWorker.enable');await sleep(300);
 const version=[...updates].reverse().find(v=>v.scriptURL?.startsWith(`chrome-extension://${extensionId}/`)&&v.runningStatus==='running');
 if(!version){out({case:'worker-stop',result:'not-run',reason:'No running version in Chrome worker inspection',updates});await sw.detach();return;}
 out({case:'worker-before-stop',versionId:version.versionId,targetId:version.targetId,status:version.runningStatus});
 const stateBefore=(await realMessage({type:'getRuntimeState'})).state;
 await sw.send('ServiceWorker.stopWorker',{versionId:version.versionId});await sleep(400);
 const stopped=updates.some(v=>v.versionId===version.versionId&&v.runningStatus==='stopped');
 const oldTargetAbsent=!(await browserCDP.send('Target.getTargets')).targetInfos.some(t=>t.targetId===version.targetId);
 const result=await realMessage({type:'getRuntimeState'});await sleep(600);
 worker=context.serviceWorkers().find(w=>w.url().startsWith(`chrome-extension://${extensionId}/`))??await context.waitForEvent('serviceworker',{timeout:5000});
 const current=[...updates].reverse().find(v=>v.versionId===version.versionId);
 out({case:'worker-stop-wake',forcedChromeStop:true,naturalIdleSuspension:false,stoppedEvent:stopped,oldTargetAbsent,newTarget:current?.targetId!==version.targetId,runningStatus:current?.runningStatus,identityPreserved:result.state?.identity.deviceId===stateBefore.identity.deviceId,clipsBefore:stateBefore.clips.length,clipsAfter:result.state?.clips.length,autoSync:result.state?.autoSync});
 await nativeRecord('worker-stop-wake');await sw.detach();
})();
