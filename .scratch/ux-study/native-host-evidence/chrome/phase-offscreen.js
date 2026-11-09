(async()=>{
 await realMessage({type:'clipboardUpdate',text:'Clipp UX native lifecycle marker'});
 await realMessage({type:'setSettings',settings:{autoSync:false}});
 globalThis.nativeBefore=(await realMessage({type:'getRuntimeState'})).state;
 const before=await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}));
 await worker.evaluate(()=>chrome.offscreen.closeDocument());
 const closed=await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}));
 await realMessage({type:'getRuntimeState'});await sleep(1200);
 const after=await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}));
 const state=(await realMessage({type:'getRuntimeState'})).state;
 out({case:'offscreen-recreation',before:before.length,closed:closed.length,after:after.length,documentChanged:before[0]?.documentId!==after[0]?.documentId,identityPreserved:nativeBefore.identity.deviceId===state.identity.deviceId,clipsBefore:nativeBefore.clips.length,clipsAfter:state.clips.length,autoSync:state.autoSync});
 await nativeRecord('offscreen-recreated');
})();
