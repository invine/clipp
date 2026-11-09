// Study build only. Loaded before app modules in popup/options/offscreen.
globalThis.__uxClipboard={text:'',readFailure:false,writeFailure:false,reads:0,writes:0};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
 readText:async()=>{__uxClipboard.reads++;if(__uxClipboard.readFailure)throw new DOMException('Study clipboard permission denied','NotAllowedError');return __uxClipboard.text},
 writeText:async text=>{__uxClipboard.writes++;if(__uxClipboard.writeFailure)throw new DOMException('Study clipboard write denied','NotAllowedError');__uxClipboard.text=String(text)},
 read:async()=>{throw new DOMException('Study isolates clipboard','NotAllowedError')},
 write:async()=>{throw new DOMException('Study isolates clipboard','NotAllowedError')}
}});
const originalExec=document.execCommand.bind(document);
document.execCommand=(command,...args)=>{
 if(/^(copy|cut|paste)$/i.test(command)){
  if(command.toLowerCase()==='copy'){__uxClipboard.text=document.activeElement?.value||getSelection()?.toString()||'';__uxClipboard.writes++}
  return command.toLowerCase()==='copy';
 }
 return originalExec(command,...args);
};
