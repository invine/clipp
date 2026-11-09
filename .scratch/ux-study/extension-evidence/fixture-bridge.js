// UI response seam in the disposable build only. No fixture account/network writes.
(() => {
  const state = structuredClone(globalThis.__uxFixtureState);
  globalThis.__uxState = state;
  globalThis.__uxCalls = [];
  globalThis.__uxFailures = {};
  const listeners = new Set();
  chrome.runtime.onMessage.addListener = fn => listeners.add(fn);
  chrome.runtime.onMessage.removeListener = fn => listeners.delete(fn);
  globalThis.__uxEmit = msg => listeners.forEach(fn => fn(msg));
  const publish = () => __uxEmit({type:'runtimeState',state});
  chrome.runtime.sendMessage = (msg, callback) => {
    __uxCalls.push(msg);
    const run = async () => {
      if (__uxFailures[msg.type]) return {ok:false,error:__uxFailures[msg.type]};
      switch (msg.type) {
        case 'getRuntimeState': return {state};
        case 'getLocalIdentity': return {identity:state.identity};
        case 'getInitializationError': return {error:state.initializationError?{code:'identity_initialization_failed'}:null};
        case 'getClipHistory': return {clips:state.clips};
        case 'searchClipHistory': return {clips:state.clips.filter(c=>c.content.toLowerCase().includes(msg.query.toLowerCase()))};
        case 'getTrustedDevices': return {devices:state.devices};
        case 'getPendingRequests': return state.pending;
        case 'getConnectedPeers': return {peers:state.peers,peerConnections:state.peerConnections};
        case 'getSettings': return {autoSync:state.autoSync,localRetentionMs:state.localRetentionMs,expiryDays:365,typesEnabled:{text:true,image:true,file:true},logLevel:'info'};
        case 'getPairingTarget': return {text:state.pairingText};
        case 'managedRelayGet': return {ok:true,configurations:state.managedRelayConfigurations,states:state.managedRelayStates};
        case 'managedRelaySet': state.managedRelayConfigurations=msg.configurations;publish();return {ok:true,configurations:msg.configurations};
        case 'setSettings': Object.assign(state,msg.settings);publish();return {ok:true};
        case 'renameLocalIdentity': state.identity.deviceName=msg.name;return {identity:state.identity};
        case 'renameDevice': {const d=state.devices.find(d=>d.deviceId===msg.id);if(d)d.localAlias=msg.name;return {device:d};}
        case 'respondTrust': state.pending=state.pending.filter(d=>d.deviceId!==msg.id);publish();return {ok:true};
        case 'revokeDevice': state.devices=state.devices.filter(d=>d.deviceId!==msg.id);publish();return {ok:true};
        case 'reuseClip': return {ok:true,outcome:'complete'};
        case 'setPin': state.pinnedIds=state.pinnedIds.filter(id=>id!==msg.id);if(msg.pinned)state.pinnedIds.push(msg.id);publish();return {ok:true,pinnedIds:state.pinnedIds};
        case 'setLocalRetention': state.localRetentionMs=msg.retentionMs;return {ok:true,localRetentionMs:msg.retentionMs};
        case 'deleteClip': state.clips=state.clips.filter(c=>c.id!==msg.id);return {ok:true};
        case 'clearHistory': state.clips=[];state.pinnedIds=[];return {ok:true};
        default: return {ok:true};
      }
    };
    const result=run();
    if(typeof callback==='function'){result.then(r=>callback(structuredClone(r)));return;}
    return result.then(r=>structuredClone(r));
  };
})();
