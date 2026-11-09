(async()=>{
globalThis.zoomOptions=async factor=>{const tabId=await options.evaluate(async()=> (await chrome.tabs.getCurrent()).id);await worker.evaluate(async({tabId,factor})=>{await chrome.tabs.setZoom(tabId,factor)}, {tabId,factor});await sleep(350);out({nativeTabZoom:await worker.evaluate(tabId=>chrome.tabs.getZoom(tabId),tabId)})};
for(const factor of [1,1.25,1.5,2]){await zoomOptions(factor);await options.evaluate(()=>scrollTo(0,0));await capture('options-native-zoom-'+factor,'options',{scenario:'Native Chrome tab zoom',zoomFactor:factor});await openPopup();await capture('popup-native-zoom-'+factor,'popup',{scenario:'Native toolbar popup after setting extension-origin tab zoom',zoomFactorRequested:factor});await closePopup();}
await zoomOptions(1);
})();
