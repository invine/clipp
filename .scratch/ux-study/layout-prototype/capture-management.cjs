// Throwaway browser render/interaction aid. Synthetic data only; no native acceptance claim.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),records=[],errors=[],checks=[];
  const dir=path.join(__dirname,'evidence','management');await fs.mkdir(dir,{recursive:true});
  page.on('pageerror',e=>errors.push(String(e)));
  const check=(name,passed)=>checks.push({name,passed});
  async function open(variant,view,surface,w,h,scale='1',scene='everyday',theme='dark'){
   await page.setViewportSize({width:w,height:h});await page.goto(`http://127.0.0.1:4195/?embed=1&variant=${variant}&view=${view}&surface=${surface}&scale=${scale}&scene=${scene}&theme=${theme}`);await page.waitForSelector('.app-frame');
  }
  async function capture(id){
   await page.screenshot({path:path.join(dir,id+'.png')});
   records.push({id,...await page.evaluate(()=>{
    const visible=s=>[...document.querySelectorAll(s)].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height});
    const controls=visible('button,input,select,textarea,summary').map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,90),r:e.getBoundingClientRect()}));
    const c=document.querySelector('.content'),dialogs=visible('dialog[open]');
    return {viewport:{w:innerWidth,h:innerHeight},contentHeight:c.scrollHeight,contentViewport:c.clientHeight,horizontalOverflow:document.body.scrollWidth>innerWidth||c.scrollWidth>c.clientWidth+1,controlsOutsideWidth:controls.filter(e=>e.r.left<-.5||e.r.right>innerWidth+.5).map(e=>e.label),smallTouchTargets:document.body.classList.contains('touch')?controls.filter(e=>e.r.width<47.5||e.r.height<47.5).map(e=>e.label):[],dialogsOutsideViewport:dialogs.filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+.5||r.top<0||r.bottom>innerHeight+.5||e.scrollWidth>e.clientWidth+1}).map(e=>e.className),visibleDeviceRows:visible('.management-device').length,preferenceControls:visible('[data-management-pref]').length};
   }),screenshot:id+'.png'});
  }
  for(const variant of ['M1','M2','M3']){
   for(const [surface,w,h,scale,scene,theme,views] of [
    ['phone',360,720,'1','everyday','dark',['devices','settings']],
    ['restored',900,668,'1','everyday','dark',['devices','settings']],
    ['wide',1440,868,'1','everyday','dark',['devices','settings']],
    ['tab',1280,800,'1','everyday','light',['devices','settings']],
    ['tablet',1200,800,'1','everyday','dark',['devices','settings']],
    ['small',320,640,'2','long','light',['devices','settings']],
    ['phone',360,720,'1','empty','dark',['devices']],
    ['restored',900,668,'1','dense','dark',['devices','settings']],
    ['phone',360,720,'1','recovery','dark',['devices']],
    ['landscape',640,360,'1','everyday','dark',['settings']],
    ['popup',480,600,'1','everyday','dark',['devices']]]){
    for(const view of views){await open(variant,view,surface,w,h,scale,scene,theme);await capture([variant,view,surface,scale,scene,theme].join('-'));}
   }
   await open(variant,'devices','phone',360,720);await page.locator('[data-management="device:tablet"]').click();await capture(variant+'-device-details');
   await page.locator('[data-management-draft]').fill('Bedside reader');await page.locator('[data-management="alias-save:tablet"]').click();await page.locator('.management-dialog').waitFor({state:'detached'});
   check(variant+' saves local alias',await page.locator('[data-management="device:tablet"]').textContent().then(t=>t.includes('Bedside reader')));
   await page.locator('[data-management="device:tablet"]').click();await page.locator('[data-management="alias-clear:tablet"]').click();await page.locator('.management-dialog').waitFor({state:'detached'});
   check(variant+' restores Device Name',await page.locator('[data-management="device:tablet"]').textContent().then(t=>t.includes('Reading tablet')));
   await page.locator('[data-management=pair]').first().click();await page.locator('[data-management-draft=pair]').fill('Synthetic pairing draft that must survive resizing');await page.setViewportSize({width:900,height:668});
   check(variant+' Pairing draft survives resize',await page.locator('[data-management-draft=pair]').inputValue()==='Synthetic pairing draft that must survive resizing');
   await page.setViewportSize({width:320,height:640});await capture(variant+'-pairing-small');await page.keyboard.press('Escape');await page.locator('.management-dialog').waitFor({state:'detached'});
   check(variant+' Pairing Escape returns focus',await page.locator('[data-management=pair]').first().evaluate(e=>e===document.activeElement));
  }
  await open('M1','settings','small',320,640,'2','recovery','light');await page.locator('[data-management=connections]').click();await capture('M1-connections-small-200');await page.locator('[data-management=background]').click();await capture('M1-background-small-200');
  await page.keyboard.press('Escape');await page.locator('.management-dialog').waitFor({state:'detached'});
  await open('M1','settings','restored',900,668);await page.locator('[data-management=connections]').click();await page.locator('[data-management=relay-add]').click();
  const draft=page.locator('[data-management-draft=relayEndpoint]');await draft.fill('https://a-long-relay-name.example.invalid/path/that-must-remain-editable');await page.setViewportSize({width:320,height:640});await capture('M1-relay-draft-small');check('relay draft survives resize',await draft.inputValue()==='https://a-long-relay-name.example.invalid/path/that-must-remain-editable');
  await open('M1','devices','phone',360,720,'1','recovery');await page.locator('[data-management=pair]').first().click();await page.locator('[data-management-draft=pair]').fill('retained after retry');await page.locator('[data-management=submit-pair]').click();await capture('M1-pairing-recovery');check('retry retains Pairing input',await page.locator('[data-management-draft=pair]').inputValue()==='retained after retry');
  await open('M1','devices','phone',360,720);await page.locator('[data-management=requests]').click();await page.locator('[data-management="request:0"]').click();await capture('M1-request-review');
  // Approved History remains available under each management variant.
  for(const variant of ['M1','M2','M3']){await open(variant,'history','phone',360,720);check(variant+' approved History controls',await page.locator('.light-controls [data-action=share].action-icon').count()===1&&await page.locator('.scope-toggle').count()===0&&await page.locator('[data-clip]').count()===9);}
  const geometryFailures=records.filter(r=>r.horizontalOverflow||r.controlsOutsideWidth.length||r.smallTouchTargets.length||r.dialogsOutsideViewport.length).map(r=>r.id);
  const interactionFailures=checks.filter(c=>!c.passed).map(c=>c.name);
  await fs.writeFile(path.join(dir,'measurements.json'),JSON.stringify({at:new Date().toISOString(),browser:browser.version(),evidenceClass:'throwaway-browser-simulation',records,checks,errors,geometryFailures,interactionFailures},null,2));
  console.log(JSON.stringify({captures:records.length,checks:checks.length,errors,geometryFailures,interactionFailures}));if(errors.length||geometryFailures.length||interactionFailures.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
