(async()=>{
globalThis.pairingText=(await message({type:'getPairingTarget'})).text;
globalThis.fixtureData=await require(path.join(root,'.scratch/ux-study/electron-evidence/fixture.cjs'))({identity:(await message({type:'getLocalIdentity'})).identity});
globalThis.typicalState={...fixtureData.typical,identity:{...fixtureData.typical.identity,deviceName:'Study Chrome'},pairingText};
globalThis.denseState=structuredClone({...fixtureData.dense,pairingText});
denseState.pending=fixtureData.ids.slice(20).map((deviceId,i)=>({deviceId,deviceName:'Incoming study device '+i+' '+'N'.repeat(i?20:60)}));
denseState.waiting=fixtureData.ids.slice(16,20).map(targetPeerId=>({targetPeerId,expiresAtUnixMs:Date.now()+300000}));
denseState.pairingErrors=[{targetPeerId:fixtureData.ids[18],code:'membership_persistence_failed'}];
const statuses=['login_needed','ready','degraded','refused','retrying','conflict','connecting'];
denseState.managedRelayConfigurations=statuses.map((status,i)=>({key:'study-relay-'+i,name:i?'Study relay '+status:'Very long relay name '+'N'.repeat(236),kind:'managed',discoveryUrl:'https://'+'long-hostname-'.repeat(8)+'example.invalid/v1/relay'}));
denseState.managedRelayStates=denseState.managedRelayConfigurations.map((c,i)=>({key:c.key,kind:c.kind,status:statuses[i],reason:i===3?'concurrent_session_limit':undefined,warning:i===2?'Synthetic diagnostic warning. '.repeat(10):undefined}));
await fs.writeFile(path.join(dir,'fixtures.json'),JSON.stringify({typical:typicalState,dense:denseState},null,2));
await fs.copyFile(path.join(dir,'fixture-bridge.js'),path.join(extensionPath,'ux-fixture-bridge.js'));
for(const file of ['src/popup.html','src/options.html']){const p=path.join(extensionPath,file);await fs.writeFile(p,(await fs.readFile(p,'utf8')).replace('<head>','<head><script src="/ux-fixture-state.js"></script><script src="/ux-fixture-bridge.js"></script>'))}
globalThis.injectFixture=async state=>{await fs.writeFile(path.join(extensionPath,'ux-fixture-state.js'),'globalThis.__uxFixtureState='+JSON.stringify(state)+';');await options.reload();await options.waitForSelector('h1');await sleep(150)};
await injectFixture(typicalState);
for(const [w,h] of [[480,640],[768,800],[1024,768],[1440,900],[1920,1080]]){await sizeOptions(w,h);await options.evaluate(()=>scrollTo(0,0));await capture('options-fixture-'+w+'x'+h,'options',{evidenceClass:'rendered-fixture',scenario:'Typical options at controlled CSS viewport',viewportMethod:'Playwright setViewportSize; not physical window/display claim'});await options.getByRole('button',{name:'Toggle Dark Mode'}).scrollIntoViewIfNeeded();await capture('options-fixture-'+w+'x'+h+'-bottom','options',{evidenceClass:'rendered-fixture',scenario:'Reach settings at controlled CSS viewport'});}
await sizeOptions(480,640);await injectFixture(denseState);await capture('options-fixture-dense-top','options',{evidenceClass:'rendered-fixture',scenario:'Twenty Trusted Devices and concurrent Pairing requests'});
await options.locator('.relay-settings').scrollIntoViewIfNeeded();await capture('options-fixture-dense-relays','options',{evidenceClass:'rendered-fixture',scenario:'Seven relays with long names and statuses'});
await options.getByRole('button',{name:'Toggle Dark Mode'}).scrollIntoViewIfNeeded();await capture('options-fixture-dense-bottom','options',{evidenceClass:'rendered-fixture',scenario:'Everyday settings after dense lists'});
out({optionsDensePage:await options.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,headings:[...document.querySelectorAll('h1,h2')].map(e=>({text:e.innerText,y:e.getBoundingClientRect().y+scrollY}))}))});
await openPopup();await capture('popup-fixture-dense-main','popup',{evidenceClass:'rendered-fixture',scenario:'Pending requests with navigation closed in native popup host'});await clickPopup('.app-logo');await capture('popup-fixture-dense-drawer','popup',{evidenceClass:'rendered-fixture',scenario:'Pending requests and long names'});
await peval("__uxFailures.respondTrust='study_storage_failure';[...document.querySelectorAll('.drawer-pane button')].find(e=>e.textContent==='Accept').click()");await sleep(250);await capture('popup-fixture-accept-failure','popup',{evidenceClass:'rendered-fixture',scenario:'Accept Pairing persistence failure'});
await peval("document.querySelector('.drawer-pane .managed-relay-card').scrollIntoView()");await capture('popup-fixture-dense-relays','popup',{evidenceClass:'rendered-fixture',scenario:'Long relay card and available actions'});
await peval("document.querySelector('.drawer-pane').scrollTop=100000");await capture('popup-fixture-dense-bottom','popup',{evidenceClass:'rendered-fixture',scenario:'Scroll to Auto Sync after dense navigation'});
out({densePopup:await peval("({drawerHeight:document.querySelector('.drawer-pane').clientHeight,drawerScrollHeight:document.querySelector('.drawer-pane').scrollHeight,drawerWidth:document.querySelector('.drawer-pane').clientWidth,drawerScrollWidth:document.querySelector('.drawer-pane').scrollWidth,acceptCalls:__uxCalls.filter(c=>c.type==='respondTrust')})")});
await closePopup();
})();
