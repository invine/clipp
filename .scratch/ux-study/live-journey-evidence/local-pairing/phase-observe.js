const state=await page.evaluate(async()=>{const s=await window.clipp.getState();return {clips:s.clips.length,devices:s.devices.length,pending:s.pending.length,waiting:s.waiting.length,pairingErrors:s.pairingErrors.map(e=>e.code||e.reason||'unclassified'),autoSync:s.autoSync,relays:s.managedRelayConfigurations.length,connections:s.peerConnections.map(p=>({path:p.path,hasDirect:p.hasDirect,hasRelay:p.hasRelay})),notice:s.identityRotationNotice}});
const notificationEvents=await electron.evaluate(()=>globalThis.__uxNotificationEvents||[]);
out({case:'electron-pairing-observation',state,notificationEvents});
await fs.writeFile(path.join(dir,'electron-current.json'),JSON.stringify({at:new Date().toISOString(),state,notificationEvents},null,2));
