// Focused render aid: one owner for All/Pinned in the selected synthetic prototype.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),records=[],errors=[],checks=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const dir=path.join(__dirname,'evidence','filter-scope');await fs.mkdir(dir,{recursive:true});
  const origin='http://127.0.0.1:4195/';
  const check=(name,passed)=>checks.push({name,passed});
  const filter=()=>page.locator('[data-light-action=filters]:visible');
  const query=()=>page.locator('input.search:visible');
  const count=()=>page.locator('[data-clip]:visible').count();
  async function capture(id){
   await page.screenshot({path:path.join(dir,id+'.png')});
   records.push({id,...await page.evaluate(()=>{
    const visible=s=>[...document.querySelectorAll(s)].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height});
    const controls=visible('button,input').map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),r:e.getBoundingClientRect()}));
    const content=document.querySelector('.content'),cards=visible('[data-clip]').map(e=>e.getBoundingClientRect()),toolbar=visible('.compact-toolbar,.light-bar')[0].getBoundingClientRect();
    return {viewport:{w:innerWidth,h:innerHeight},horizontalOverflow:document.body.scrollWidth>innerWidth||content.scrollWidth>content.clientWidth+1,controlsOutsideWidth:controls.filter(e=>e.r.left<-.5||e.r.right>innerWidth+.5).map(e=>e.label),smallTouchTargets:document.body.classList.contains('touch')?controls.filter(e=>e.r.width<47.5||e.r.height<47.5).map(e=>e.label):[],visibleScopeIndicators:visible('.active-scope').length,firstClipY:cards[0]?.y,cardHeights:cards.map(c=>c.height),toolbarHeight:toolbar.height,searchWidth:visible('input.search')[0].getBoundingClientRect().width,overlaysOutsideViewport:visible('dialog[open]').filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+.5||r.top<0||r.bottom>innerHeight+.5}).length};
   }),screenshot:id+'.png'});
  }
  for(const [surface,w,h,scale='1',theme='dark'] of [['restored',900,668],['wide',1440,868],['fullscreen',1920,1080],['restored',721,668,'2','light'],['tablet',1200,800],['small',320,640],['small',320,640,'2','light']]){
   const id=`${surface}-${w}-${scale}-${theme}`;
   await page.setViewportSize({width:w,height:h});await page.goto(`${origin}?embed=1&variant=1&surface=${surface}&scale=${scale}&theme=${theme}&icons=icons`);
   await page.waitForSelector('.app-frame');await capture(id+'-all');
   check(id+' scope only in Filters',await page.locator('.scope-toggle').count()===0&&await filter().count()===1&&await page.locator('.active-scope:visible').count()===0);
   await filter().click();if(w===721)await capture(id+'-menu');await page.locator('[data-light-scope=pinned]').click();
   check(id+' pinned selection',await count()===2&&await page.locator('.active-scope:visible').count()===1);
   check(id+' selection focus',await filter().evaluate(e=>e===document.activeElement));await capture(id+'-pinned');
   await query().fill('npm');await page.locator('[data-light-action=clear-scope]:visible').click();
   check(id+' clear scope keeps query',await count()===1&&await query().inputValue()==='npm');
   check(id+' clear scope focus',await filter().evaluate(e=>e===document.activeElement));
   await page.locator('[data-query-clear]:visible').click();check(id+' all restored',await count()===9);
   await filter().click();await page.keyboard.press('Escape');await page.locator('.light-panel').waitFor({state:'detached'});
   check(id+' Escape focus',await filter().evaluate(e=>e===document.activeElement));
  }
  // Resize the same live document; changing the workbench preset deliberately reloads it.
  await page.setViewportSize({width:900,height:668});await page.goto(`${origin}?embed=1&variant=1&surface=restored&icons=icons`);
  await query().fill('npm');await filter().click();await page.locator('[data-light-scope=pinned]').click();
  await page.setViewportSize({width:360,height:720});
  check('wide to narrow retains query and scope',await query().inputValue()==='npm'&&await count()===1&&await page.locator('.active-scope:visible').count()===1);
  await capture('resized-narrow-query-pinned');
  await page.setViewportSize({width:900,height:668});
  check('narrow to wide retains query and scope',await query().inputValue()==='npm'&&await count()===1&&await page.locator('.active-scope:visible').count()===1);
  await page.locator('[data-light-action=clear-scope]:visible').click();await page.locator('[data-query-clear]:visible').click();
  check('resized scope and query remain clearable',await count()===9&&await query().evaluate(e=>e===document.activeElement));
  await filter().click();await page.locator('[data-light-scope=pinned]').click();await filter().click();await page.locator('[data-light-scope=all]').click();
  check('All Clips in Filters restores full history',await count()===9&&await page.locator('.active-scope:visible').count()===0);
  const geometryFailures=records.filter(r=>r.horizontalOverflow||r.controlsOutsideWidth.length||r.smallTouchTargets.length||r.overlaysOutsideViewport).map(r=>r.id);
  const interactionFailures=checks.filter(c=>!c.passed).map(c=>c.name);
  await fs.writeFile(path.join(dir,'measurements.json'),JSON.stringify({at:new Date().toISOString(),browser:browser.version(),evidenceClass:'throwaway-browser-simulation',records,checks,errors,geometryFailures,interactionFailures},null,2));
  console.log(JSON.stringify({captures:records.length,checks:checks.length,errors,geometryFailures,interactionFailures}));
  if(errors.length||geometryFailures.length||interactionFailures.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
