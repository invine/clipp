(async()=>{
 const cdp=await context.newCDPSession(options);
 await cdp.send('Network.enable');await cdp.send('Network.clearBrowserCache');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await context.setOffline(true);
 out({case:'cold-offline-prepared',testProfileOnly:true,networkOffline:true,cacheCleared:true,productionStateModified:false});
 await cdp.detach();
})();
