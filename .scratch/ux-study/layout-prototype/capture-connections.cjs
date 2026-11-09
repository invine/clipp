// Render the synthetic connection vocabulary in its real prototype host.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage(),records=[],errors=[],checks=[];page.on('pageerror',e=>errors.push(String(e)));
 const dir=path.join(__dirname,'evidence','connections');await fs.mkdir(dir,{recursive:true});
 const cases=['direct','relayed','directOnly','waiting','offline','attention','degraded','warning','retrying','connecting','unknown','newDevice'];
 async function open(variant,connection,view='history',surface='phone',w=360,h=720,scale='1',theme='dark',sync='on'){
  await page.setViewportSize({width:w,height:h});await page.goto(`http://127.0.0.1:4195/?embed=1&variant=${variant}&connection=${connection}&view=${view}&surface=${surface}&scale=${scale}&theme=${theme}&sync=${sync}`);await page.waitForSelector('.app-frame');
 }
 async function capture(id){
  await page.screenshot({path:path.join(dir,id+'.png')});
  records.push({id,...await page.evaluate(()=>{
   const visible=s=>[...document.querySelectorAll(s)].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height});
   const c=document.querySelector('.content'),controls=visible('button,input,select,summary').map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),r:e.getBoundingClientRect()}));
   const status=visible('.connection-status')[0],row=visible('.light-bar')[0],search=visible('input.search')[0],first=visible('[data-clip]')[0];
   return {viewport:{w:innerWidth,h:innerHeight},statusCount:visible('.connection-status').length,statusName:status?.getAttribute('aria-label'),statusColor:status?getComputedStyle(status).color:null,statusSvgCount:status?.querySelectorAll('svg').length,firstClipY:first?.getBoundingClientRect().y,toolbarHeight:row?.getBoundingClientRect().height,searchWidth:search?.getBoundingClientRect().width,horizontalOverflow:document.body.scrollWidth>innerWidth||c.scrollWidth>c.clientWidth+1,controlsOutsideWidth:controls.filter(e=>e.r.left<-.5||e.r.right>innerWidth+.5).map(e=>e.label),smallTouchTargets:document.body.classList.contains('touch')?controls.filter(e=>e.r.width<47.5||e.r.height<47.5).map(e=>e.label):[],overlaysOutsideViewport:visible('dialog[open],[role=tooltip]').filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+.5||r.top<0||r.bottom>innerHeight+.5||e.scrollWidth>e.clientWidth+1}).map(e=>e.className),deviceNames:visible('.management-device').map(e=>e.getAttribute('aria-label'))};
  }),screenshot:id+'.png'});
 }
 const check=(name,passed)=>checks.push({name,passed});
 for(const variant of ['S1','S2','S3'])for(const state of cases){await open(variant,state);await capture(variant+'-history-phone-'+state);}
 for(const state of ['direct','relayed','offline','unknown']){await open('S2',state,'devices');await capture('S2-devices-phone-'+state);}
 for(const [surface,w,h,scale,theme,state] of [['restored',900,668,'1','dark','direct'],['wide',1440,868,'1','dark','attention'],['fullscreen',1920,1080,'1','dark','waiting'],['popup',480,600,'1','dark','relayed'],['small',320,640,'1','light','direct'],['small',320,640,'2','light','attention'],['tablet',1200,800,'1','light','direct'],['landscape',640,360,'1','dark','offline']]){
  await open('S2',state,'history',surface,w,h,scale,theme);await capture(['S2','history',surface,scale,state].join('-'));await page.locator('.connection-status:visible').click();await capture(['S2','panel',surface,scale,state].join('-'));await page.keyboard.press('Escape');await page.locator('.management-dialog').waitFor({state:'detached'});check(surface+' panel focus returns',await page.locator('.connection-status:visible').evaluate(e=>e===document.activeElement));
 }
 await open('S2','direct','history');await page.locator('.light-controls .search').fill('npm');await capture('S2-phone-active-search');await page.locator('.connection-status:visible').click();await page.locator('[data-connection-auto]').click();await page.keyboard.press('Escape');await page.locator('.management-dialog').waitFor({state:'detached'});await capture('S2-phone-auto-sync-off');check('Auto Sync off leaves physical connection green',await page.locator('.connection-status:visible').getAttribute('aria-label').then(t=>t.startsWith('Direct connection available'))&&await page.locator('.sync-off:visible').count()===1);check('opening status keeps search query',await page.locator('.light-controls .search').inputValue()==='npm');
 await page.locator('.connection-status:visible').click();await page.locator('[data-management=connection-devices]').click();check('status routes to selected M1 Devices',await page.locator('.management-M1').count()===1);await page.locator('[data-view=settings]:visible').click();check('Settings uses selected M3 categories',await page.locator('.management-M3 .management-categories').count()===1);
 await open('S2','attention','history','restored',900,668);await page.locator('.connection-status:visible').hover();await page.getByRole('tooltip').waitFor();await capture('S2-attention-hover-hint');
 check('partial relay problem overrides direct availability',await page.locator('.connection-status:visible').getAttribute('aria-label').then(t=>t.startsWith('Connections need attention')));
 // The comparison workbench remains URL-addressable and switchable.
 await page.setViewportSize({width:1120,height:1000});await page.goto('http://127.0.0.1:4195/?variant=S2&view=history&surface=phone&connection=direct');await page.frameLocator('iframe').locator('.connection-status').first().waitFor({state:'attached'});await page.locator('[data-key=connection]').selectOption('attention');await page.frameLocator('iframe').getByRole('button',{name:'Connections need attention. Connection status and options'}).last().waitFor();await page.locator('[data-cycle="1"]').click();await page.waitForURL(/variant=S3/);check('workbench keeps connection fixture while cycling',new URL(page.url()).searchParams.get('connection')==='attention');
 const geometryFailures=records.filter(r=>r.horizontalOverflow||r.controlsOutsideWidth.length||r.smallTouchTargets.length||r.overlaysOutsideViewport.length).map(r=>r.id);
 const interactionFailures=checks.filter(c=>!c.passed).map(c=>c.name);
 const statusFailures=records.filter(r=>r.id.includes('history')&&(r.statusCount!==1||r.statusSvgCount!==1)).map(r=>r.id);
 await fs.writeFile(path.join(dir,'measurements.json'),JSON.stringify({at:new Date().toISOString(),browser:browser.version(),evidenceClass:'throwaway-browser-simulation',records,checks,errors,geometryFailures,interactionFailures,statusFailures},null,2));console.log(JSON.stringify({captures:records.length,checks:checks.length,errors,geometryFailures,interactionFailures,statusFailures}));if(errors.length||geometryFailures.length||interactionFailures.length||statusFailures.length)process.exitCode=1;
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
