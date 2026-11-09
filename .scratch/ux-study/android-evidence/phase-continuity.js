(async()=>{
await nativeText('DON’T ALLOW');await capture('native-notifications-denied',{scenario:'Permission denied; bottom controls and blocked notification guidance'});out({afterNotificationDenial:await evaluate('__uxClient.getState().then(s=>s.backgroundContinuity)')});
// Test fixture setup grants this owned app's notification permission after recording denial.
await shell('pm','grant',pkg,'android.permission.POST_NOTIFICATIONS');await evaluate("__uxClient.runtimeAdapter.notifications.show({id:'study-request',title:'Clipp study request',body:'Synthetic request for UX inspection'})");
evaluate("(()=>{const e=document.querySelector('#background-continuity');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'enabled');e.dispatchEvent(new Event('change',{bubbles:true}))})()").catch(e=>out({enableDialogCall:String(e)}));await sleep(1200);await nativeCapture('native-continuity-confirmation',{scenario:'Actual continuity opt-in confirmation'});out({confirmUI:await uiTree()});
})();
