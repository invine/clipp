// Study-only interval boundary. Native API is called unchanged when enabled.
const nativeClipboard=navigator.clipboard;
const nativeExec=document.execCommand.bind(document);
const markers=new Set(['CLIPP UX PERMISSION CHECK 2026-10-10','CLIPP UX COPY CHECK 2026-10-10']);
globalThis.__uxClipboard={text:'',nativeEnabled:false,nativeReads:0,nativeWrites:0,unexpected:0};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
 readText:async()=>{if(!__uxClipboard.nativeEnabled)return __uxClipboard.text;__uxClipboard.nativeReads++;const text=await nativeClipboard.readText();if(!markers.has(text)){__uxClipboard.unexpected++;return ''}return text},
 writeText:async text=>{if(!__uxClipboard.nativeEnabled){__uxClipboard.text=text;return}if(!markers.has(text))throw Error('synthetic_marker_required');await nativeClipboard.writeText(text);__uxClipboard.nativeWrites++},
 read:async()=>{throw new DOMException('Text-only study','NotAllowedError')},
 write:async()=>{throw new DOMException('Text-only study','NotAllowedError')}
}});
document.execCommand=(command,...args)=>{if(/^(copy|cut|paste)$/i.test(command)){const text=document.activeElement?.value||getSelection()?.toString()||'';if(command.toLowerCase()==='copy'){if(__uxClipboard.nativeEnabled){if(!markers.has(text))throw Error('synthetic_marker_required');const result=nativeExec(command,...args);if(result)__uxClipboard.nativeWrites++;return result}__uxClipboard.text=text;return true}return false}return nativeExec(command,...args)};
