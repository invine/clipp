(async()=>{
 const before=await page.evaluate(()=>window.clipp.getState());
 await closeOwned();await launchSame();
 const after=await page.evaluate(()=>window.clipp.getState());
 await record({case:'native-electron-restart',identityPreserved:before.identity.deviceId===after.identity.deviceId,clipsBefore:before.clips.length,clipsAfter:after.clips.length,autoSync:after.autoSync,configurationCount:after.managedRelayConfigurations.length});
 await nativeCapture('native-restarted',{sameIsolatedProfile:true});
})();
