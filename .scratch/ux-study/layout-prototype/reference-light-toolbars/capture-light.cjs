// Visual/interactivity aid for two throwaway toolbar choices; no native acceptance claim.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const dir=path.join(__dirname,'evidence','light-toolbars');await fs.mkdir(dir,{recursive:true});const records=[],interactions=[];
 const origin='http://127.0.0.1:4195/';
 async function capture(id,context={}){
  await page.screenshot({path:path.join(dir,id+'.png')});
  const m=await page.evaluate(()=>{
   const content=document.querySelector('.content'),r=content.getBoundingClientRect();
   const cards=[...document.querySelectorAll('[data-clip]')].filter(c=>!c.hidden).map(c=>c.getBoundingClientRect());
   const controls=[...document.querySelectorAll('button,input,select')].map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),r:e.getBoundingClientRect()})).filter(e=>e.r.width&&e.r.height);
   const bar=document.querySelector('.light-bar')?.getBoundingClientRect();
   const dialog=document.querySelector('dialog[open]')?.getBoundingClientRect();
   return {inner:{w:innerWidth,h:innerHeight},bodyScrollWidth:document.body.scrollWidth,content:{w:r.width,h:r.height,scrollW:content.scrollWidth},toolbarHeight:bar?.height||null,firstClipY:cards[0]?.y??null,fullClips:cards.filter(c=>c.top>=Math.max(r.top,0)&&c.bottom<=Math.min(r.bottom,innerHeight)&&c.left>=0&&c.right<=innerWidth).length,visibleClipCount:cards.length,cardHeights:cards.map(c=>Number(c.height.toFixed(2))),controlsOutsideBody:controls.filter(e=>e.r.left<-.5||e.r.right>innerWidth+.5).map(e=>e.label),undersizedTouchTargets:document.body.classList.contains('touch')?controls.filter(e=>e.r.width<47.5||e.r.height<47.5).map(e=>e.label):[],dialogOutsideViewport:dialog?dialog.top<0||dialog.bottom>innerHeight+.5||dialog.left<0||dialog.right>innerWidth+.5:false};
  });records.push({id,evidenceClass:'throwaway-browser-simulation',...context,...m,screenshot:id+'.png'});
 }
 const cases=[['phone',360,720],['small',320,640],['popup',480,600],['narrow',520,728],['short',340,350],['landscape',640,360],['wide',1440,868],['small',320,640,'1.3','long','light'],['small',320,640,'2','long','light'],['phone',360,720,'2','recovery'],['phone',360,720,'1','nomatch'],['phone',360,720,'1','empty']];
 for(const variant of ['1','3']){
  for(const [surface,w,h,scale='1',scene='everyday',theme='dark'] of cases){
   await page.setViewportSize({width:w,height:h});await page.goto(`${origin}?embed=1&variant=${variant}&surface=${surface}&scale=${scale}&scene=${scene}&theme=${theme}`);await page.waitForSelector('.app-frame');
   await capture([variant,surface,scale,scene,theme].join('-'),{variant,surface,scale,scene,theme});
  }
  await page.setViewportSize({width:360,height:720});await page.goto(`${origin}?embed=1&variant=${variant}&surface=phone`);
  const selector=variant==='1'?'[data-light-action=filters]':'[data-light-action=scope]';
  await page.locator(selector).click();await capture(`${variant}-scope-panel`,{variant,state:'scope panel'});
  await page.keyboard.press('Escape');const escapeRestoredFocus=await page.locator(selector).evaluate(e=>e===document.activeElement);
  await page.locator(selector).click();await page.locator('[data-light-scope=pinned]').click();await capture(`${variant}-pinned`,{variant,state:'pinned'});
  const pinnedCount=await page.locator('[data-clip]:visible').count();
  if(variant==='1')await page.locator('[data-light-action=clear-scope]').click();else{await page.locator(selector).click();await page.locator('[data-light-scope=all]').click();}
  if(variant==='3')await page.locator('[data-light-action=search]').click();
  await page.locator('.light-controls input.search').fill('npm');await capture(`${variant}-search`,{variant,state:'search'});
  const searchCount=await page.locator('[data-clip]:visible').count();
  await page.locator('.light-controls input.search').fill('not in the history');const noMatchVisible=await page.locator('.query-empty').isVisible();
  await page.locator('.query-empty [data-light-action=clear-query]').click();
  if(variant==='3')await page.locator('[data-light-action=end-search]').click();
  const returnedCount=await page.locator('[data-clip]:visible').count();
  await page.locator('.light-controls [data-light-action=more]').first().click();await capture(`${variant}-more-panel`,{variant,state:'more panel'});
  await page.locator('[data-light-action=menu-auto]').click();await capture(`${variant}-auto-off`,{variant,state:'Auto Sync off'});
  const offVisible=await page.locator('.sync-off').isVisible();await page.locator('.sync-off').click();await page.locator('[data-light-action=menu-auto]').click();
  await page.locator('.light-controls [data-action=share]').click();const shareFeedback=await page.locator('[role=status]').textContent();
  await page.locator('[data-copy]').first().click();const copyFeedback=await page.locator('[role=status]').textContent();
  if(variant==='3')await page.locator('[data-light-action=search]').click();
  await page.locator('.light-controls input.search').fill('npm');await page.setViewportSize({width:1440,height:868});const queryAfterResize=await page.locator('.wide-controls input.search').inputValue();const matchesAfterResize=await page.locator('[data-clip]:visible').count();
  interactions.push({variant,escapeRestoredFocus,pinnedCount,searchCount,noMatchVisible,returnedCount,offVisible,shareFeedback,copyFeedback,queryAfterResize,matchesAfterResize});
  await page.setViewportSize({width:320,height:640});await page.goto(`${origin}?embed=1&variant=${variant}&surface=small&scale=2&theme=light`);
  await page.locator(selector).click();await capture(`${variant}-large-scope-panel`,{variant,state:'200% scope panel'});await page.keyboard.press('Escape');
  if(variant==='3'){await page.locator('[data-light-action=search]').click();await page.locator('.light-controls input.search').fill('npm');await capture(`${variant}-large-search`,{variant,state:'200% search'});await page.locator('[data-light-action=end-search]').click();}
  await page.locator('[data-clip]').first().scrollIntoViewIfNeeded();await capture(`${variant}-large-history-scrolled`,{variant,state:'200% history scrolled'});
  await page.setViewportSize({width:340,height:350});await page.goto(`${origin}?embed=1&variant=${variant}&surface=short`);await page.locator('.light-controls [data-light-action=more]').click();await capture(`${variant}-short-more-panel`,{variant,state:'short menu'});
 }
 await page.setViewportSize({width:1100,height:1000});await page.goto(origin);await page.waitForSelector('iframe');await page.frames().find(f=>f.url().includes('embed=1')).waitForSelector('.app-frame');await page.screenshot({path:path.join(dir,'workbench.png'),fullPage:true});await page.locator('[data-cycle="1"]').click();await page.waitForURL(/variant=3/);const switched=await page.locator('.prototype-switcher strong').textContent();
 const failures=records.filter(r=>r.bodyScrollWidth>r.inner.w||r.content.scrollW>r.content.w+1||r.controlsOutsideBody.length||r.undersizedTouchTargets.length||r.dialogOutsideViewport);
 const result={at:new Date().toISOString(),browser:browser.version(),fixture:'same nine synthetic Clips; browser prototype comparison only',records,interactions,switched,errors,geometryFailures:failures.map(r=>r.id)};
 await fs.writeFile(path.join(dir,'measurements.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({captures:records.length,errors,failures,interactions,switched}));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
