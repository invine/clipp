/* THROWAWAY connection-status exploration. State fixtures are not runtime telemetry. */
const connectionCases={
 direct:{label:'Direct + relayed devices · relay ready',paths:['direct','relay','offline'],relay:'ready'},
 relayed:{label:'Relayed devices only · relay ready',paths:['relay','relay','offline'],relay:'ready'},
 directOnly:{label:'Direct devices · no relay configured',paths:['direct','offline','offline'],relay:'none'},
 waiting:{label:'Relay ready · devices offline',paths:['offline','offline','offline'],relay:'ready'},
 offline:{label:'Devices offline · no relay configured',paths:['offline','offline','offline'],relay:'none'},
 attention:{label:'Relay needs login · devices still connected',paths:['direct','relay','offline'],relay:'login_needed'},
 degraded:{label:'Relay service degraded · devices still connected',paths:['relay','relay','offline'],relay:'degraded'},
 warning:{label:'Relay ready with a warning · direct device connected',paths:['direct','offline','offline'],relay:'ready',warning:true},
 retrying:{label:'Relay retrying · devices offline',paths:['offline','offline','offline'],relay:'retrying'},
 connecting:{label:'Starting connections · state still settling',paths:['offline','offline','offline'],relay:'connecting'},
 unknown:{label:'Device connected · path unknown',paths:['unknown','offline','offline'],relay:'ready'},
 newDevice:{label:'First use · no other devices or relays',paths:[],relay:'none'}
};
const connectionSvg=body=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// Three direct-only alternatives on the existing History/Devices host; no layout changes.
function directConnectionAlternative(variant=state.variant){
 if(variant==='L1')return connectionSvg('<path d="M9 7H7a5 5 0 0 0 0 10h2m6-10h2a5 5 0 0 1 0 10h-2M8 12h8"/>');
 if(variant==='L2')return connectionSvg('<rect x="2" y="4" width="13" height="11" rx="2"/><path d="M5 19h7m-3.5-4v4"/><rect x="15" y="8" width="7" height="13" rx="1.5"/><path d="M18 18h1"/>');
 if(variant==='L3')return connectionSvg('<circle cx="12" cy="12" r="9" opacity=".4"/><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>');
 return null;
}
function connectionPathIcon(path){
 if(path==='direct'&&directConnectionAlternative())return directConnectionAlternative();
 if(path==='direct')return connectionSvg('<g transform="rotate(-45 12 12)"><circle cx="4" cy="12" r="2.5"/><circle cx="20" cy="12" r="2.5"/><path d="M7 12h10"/></g>');
 if(path==='relay')return connectionSvg('<circle cx="3.5" cy="16.5" r="2"/><circle cx="20.5" cy="16.5" r="2"/><path d="m6 14 4-6m4 0 4 6M12 3l3 3-3 3-3-3Z"/>');
 if(path==='unknown')return connectionSvg('<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>');
 return connectionSvg('<circle cx="4" cy="12" r="2.5"/><circle cx="20" cy="12" r="2.5"/><path d="M7 12h2m6 0h2M14 6l-4 12"/>');
}
function connectionFixture(){return connectionCases[state.connection]||connectionCases.direct;}
function connectionSummary(){
 const f=connectionFixture(),direct=f.paths.includes('direct'),relay=f.paths.includes('relay'),unknown=f.paths.includes('unknown');
 // Approved priority: explicit configured-service attention precedes the available peer path.
 if(f.warning||['login_needed','degraded','retrying'].includes(f.relay))return {key:'attention',color:'relay',label:'Connections need attention',reason:f.warning?'A relay reported a warning; connections may still work.':f.relay==='login_needed'?'A configured relay needs sign-in.':f.relay==='degraded'?'A relay service needs attention; device connections may still work.':'A configured relay is reconnecting.'};
 if(f.relay==='connecting')return {key:'connecting',color:'offline',label:'Connecting',reason:'Connection state is still being established.'};
 if(direct)return {key:'direct',color:'direct',label:'Direct connection available',reason:'A Trusted Device has a direct connection.'};
 if(unknown)return {key:'unknown',color:'offline',label:'Device connected; path unknown',reason:'A Trusted Device is connected, but its path is not known.'};
 if(relay)return {key:'relay',color:'relay',label:'Connected through relay',reason:'Trusted Devices are reachable through a relay.'};
 if(f.relay==='ready')return {key:'waiting',color:'offline',label:'Relay ready; waiting for devices',reason:'The relay is ready. Other Trusted Devices are offline.'};
 if(!f.paths.length)return {key:'idle',color:'offline',label:'No other devices paired',reason:'Pair another device when you are ready.'};
 return {key:'offline',color:'offline',label:'No device connection',reason:'Other Trusted Devices are offline.'};
}
function connectionHealthIcon(summary,variant=state.variant){
 const key=summary.key;
 if(['L1','L2','L3'].includes(variant)){
  if(key==='direct')return directConnectionAlternative(variant);
  variant='S3';
 }
 // User-selected direct motif: restore the original three-node triangle in the top row.
 if(key==='direct')return connectionSvg('<circle cx="4" cy="17" r="2.5"/><circle cx="20" cy="17" r="2.5"/><circle cx="12" cy="5" r="2.5"/><path d="m5.5 14.5 5-7m3 0 5 7M7 17h10"/>');
 if(variant==='S1'){
  if(key==='attention')return connectionSvg('<path d="M9 8H7a5 5 0 0 0 0 10h2m6-10h2a5 5 0 0 1 0 10h-2M12 3v7m0 4h.01"/>');
  if(['waiting','idle','connecting'].includes(key))return connectionSvg('<circle cx="4" cy="12" r="2.5"/><circle cx="20" cy="12" r="2.5"/><path stroke-dasharray="1 3" d="M8 12h8"/>');
  return connectionPathIcon(key==='direct'?'direct':key==='relay'?'relay':key==='unknown'?'unknown':'offline');
 }
 if(variant==='S3'){
  const body=key==='relay'?'<path d="m7 15 5-8 5 8M10 15h4"/>':key==='attention'?'<path d="M12 6v8m0 4h.01"/>':key==='unknown'?'<path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01"/>':key==='offline'?'<path d="m7 7 10 10"/>':'<path stroke-dasharray="1 3" d="M7 12h10"/>';
  return connectionSvg('<circle cx="12" cy="12" r="9"/>'+body);
 }
 // S2 keeps one network silhouette; a route node, break or attention mark changes the shape.
 const nodes='<circle cx="4" cy="17" r="2.5"/><circle cx="20" cy="17" r="2.5"/>';
 if(key==='attention')return connectionSvg(nodes+'<path d="m5.5 14.5 3-5m10 5-3-5M12 2v8m0 4h.01"/>');
 if(key==='relay')return connectionSvg(nodes+'<path d="m6 14 4-6m4 0 4 6M12 2l3 3-3 3-3-3Z"/>');
 if(key==='unknown')return connectionSvg(nodes+'<path d="M9 6a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01M7 17h10"/>');
 return connectionSvg(nodes+`<circle cx="12" cy="5" r="2.5"/><path ${key==='offline'?'':'stroke-dasharray="1 3"'} d="m6 14 3-4m6 0 3 4"/>${key==='offline'?'<path d="m3 3 18 18"/>':''}`);
}
function connectionStatusButton(extra=''){
 const summary=connectionSummary();return `<button class="action-icon connection-status path-${summary.color} ${extra}" data-management="connection-status" aria-label="${summary.label}. Connection status and options" data-tip="${summary.label}" aria-haspopup="dialog">${connectionHealthIcon(summary)}</button>`;
}
function connectionPanel(trigger){
 const f=connectionFixture(),s=connectionSummary();
 const deviceLabel=f.paths.includes('direct')?'Direct connection available':f.paths.includes('relay')?'Connected through relay':f.paths.includes('unknown')?'Connected; path unknown':f.paths.length?'No device online':'No other devices paired';
 const relayLabel=f.warning?'Ready; warning':{ready:'Ready',none:'Not configured',login_needed:'Needs sign-in',degraded:'Service needs attention',retrying:'Reconnecting',connecting:'Connecting'}[f.relay];
 const body=`<div class="connection-panel-status path-${s.color}">${connectionHealthIcon(s)}<strong>${s.label}</strong></div><p class="field-help">${s.reason}</p><dl class="connection-summary"><div><dt>Devices</dt><dd>${deviceLabel}</dd></div><div><dt>Relay</dt><dd>${relayLabel}</dd></div></dl><button class="connection-auto" data-connection-auto aria-pressed="${state.auto}"><span>Auto Sync</span><span>${state.auto?'On':'Off'}</span></button><div class="management-actions">${mButton('connection-devices','Devices')}${mButton('connection-settings','Connections settings')}</div>`;
 managementDialog('Connections',body,trigger);
}
function handleConnectionAction(b){
 if(!isStatusStudy())return false;
 if(b.hasAttribute('data-connection-auto')){state.auto=!state.auto;b.setAttribute('aria-pressed',String(state.auto));b.lastElementChild.textContent=state.auto?'On':'Off';emit();return true;}
 if(b.dataset.management==='connection-status'){connectionPanel(b);return true;}
 if(['connection-devices','connection-settings'].includes(b.dataset.management)){
  const view=b.dataset.management==='connection-devices'?'devices':'settings';managementState.settingsTab='connections';
  if(sizes[state.surface].kind==='popup'){const p=new URLSearchParams({variant:state.variant,surface:'tab',view,theme:state.theme,connection:state.connection});window.open(location.pathname+'?'+p,'_blank');}
  else {state.view=view;renderSurface();const title=document.querySelector('h1');if(title){title.tabIndex=-1;title.focus();}}
  return true;
 }
 return false;
}
