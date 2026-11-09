// Render aid for the agreed icon treatment. This operates only on synthetic preview data.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const errors=[],records=[],interactions={};page.on('pageerror',e=>errors.push(String(e)));
 const dir=path.join(__dirname,'evidence','icon-actions');await fs.mkdir(dir,{recursive:true});
 const origin='http://127.0.0.1:4195/';
 async function open(surface,w,h,scale='1',scene='everyday',theme='dark'){
  await page.setViewportSize({width:w,height:h});await page.goto(`${origin}?embed=1&variant=1&icons=icons&surface=${surface}&scale=${scale}&scene=${scene}&theme=${theme}`);await page.waitForSelector('.app-frame');
 }
 async function capture(id,context={}){
  await page.screenshot({path:path.join(dir,id+'.png')});
  const geometry=await page.evaluate(()=>{
   const visible=selector=>[...document.querySelectorAll(selector)].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height});
   const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
   const content=document.querySelector('.content'),r=content.getBoundingClientRect();const cards=visible('[data-clip]').map(e=>e.getBoundingClientRect());
   const controls=visible('button,input,select').map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),r:e.getBoundingClientRect()}));
   return {inner:{w:innerWidth,h:innerHeight},bodyScrollWidth:document.body.scrollWidth,content:{w:r.width,scrollW:content.scrollWidth},firstClipY:cards[0]?.y??null,fullClips:cards.filter(c=>c.top>=Math.max(r.top,0)&&c.bottom<=Math.min(r.bottom,innerHeight)).length,cardHeights:cards.map(c=>c.height),share:rect(visible('[data-action=share]')[0]),copy:rect(visible('[data-copy]')[0]),search:rect(visible('input.search')[0]),clearSearch:rect(visible('[data-query-clear]')[0]),controlsOutsideBody:controls.filter(e=>e.r.left<-.5||e.r.right>innerWidth+.5).map(e=>e.label),smallTouchTargets:document.body.classList.contains('touch')?controls.filter(e=>e.r.width<47.5||e.r.height<47.5).map(e=>e.label):[],unnamedIcons:visible('.action-icon').filter(e=>!e.getAttribute('aria-label')).length,overlaysOutsideViewport:visible('dialog[open],.action-tooltip').filter(e=>{const q=e.getBoundingClientRect();return q.left<0||q.right>innerWidth+.5||q.top<0||q.bottom>innerHeight+.5}).map(e=>e.className)};
  });records.push({id,evidenceClass:'throwaway-browser-simulation',...context,...geometry,screenshot:id+'.png'});
 }
 const cases=[['phone',360,720],['small',320,640],['popup',480,600],['narrow',520,728],['short',340,350],['landscape',640,360],['wide',1440,868],['fullscreen',1920,1080],['small',320,640,'1.3','long','light'],['small',320,640,'2','long','light'],['wide',1440,868,'2','long'],['phone',360,720,'2','recovery'],['phone',360,720,'1','nomatch'],['phone',360,720,'1','empty']];
 for(const [surface,w,h,scale='1',scene='everyday',theme='dark'] of cases){await open(surface,w,h,scale,scene,theme);await capture([surface,scale,scene,theme].join('-'),{surface,scale,scene,theme});}
 await open('phone',360,720);const query=page.locator('.light-controls .search');
 interactions.clearInitiallyHidden=await page.locator('.light-controls [data-query-clear]').isHidden();
 await query.fill('npm');await capture('phone-search');interactions.searchCount=await page.locator('[data-clip]:visible').count();
 await page.locator('.light-controls [data-query-clear]').click();interactions.clearReturnedFocus=await query.evaluate(e=>e===document.activeElement);interactions.clearedCount=await page.locator('[data-clip]:visible').count();
 const copy=page.locator('.copy-action').first();const copyName=await copy.getAttribute('aria-label');await copy.click();await capture('phone-copied');
 interactions.copyCheckVisible=await copy.evaluate(e=>e.classList.contains('copied'));interactions.copyNameStable=copyName===await copy.getAttribute('aria-label');interactions.copyFeedback=await page.locator('[role=status]').textContent();
 await page.waitForFunction(()=>!document.querySelector('.copy-action.copied'));interactions.copyCheckCleared=true;
 const pin=page.locator('[data-pin]').first(),pinName=await pin.getAttribute('aria-label');await pin.click();interactions.pinNameStable=pinName===await pin.getAttribute('aria-label');interactions.pinPressed=await pin.getAttribute('aria-pressed');
 await page.locator('.light-controls [data-action=share]').click();interactions.shareFeedback=await page.locator('[role=status]').textContent();
 // Native browser dialog supports the icon Close control's focus return.
 const opener=page.locator('[data-open]').first();await opener.click();await capture('phone-details');
 await page.locator('.clip-dialog .copy-action').click();await capture('phone-detail-copied');interactions.detailFeedbackInsideDialog=await page.locator('.clip-dialog [role=status]').count()===1;interactions.detailCopyFeedback=await page.locator('[role=status]').textContent();await page.locator('.clip-dialog [data-action=close-detail]').click();interactions.closeReturnedFocus=await opener.evaluate(e=>e===document.activeElement);
 await opener.click();await page.keyboard.press('Escape');await page.locator('.clip-dialog').waitFor({state:'detached'});interactions.escapeClosedDetails=await page.locator('.clip-dialog').count()===0;interactions.escapeReturnedFocus=await opener.evaluate(e=>e===document.activeElement);
 await open('small',320,640,'1.3','long','light');await page.locator('.light-controls .search').fill('npm');await capture('small-130-search');
 await open('small',320,640,'2','long','light');await page.locator('.light-controls .search').fill('npm');await capture('small-200-search');await page.locator('.light-controls [data-query-clear]').click();await page.locator('[data-open]').first().click();await capture('small-200-details');await page.keyboard.press('Escape');await page.locator('[data-clip]').first().scrollIntoViewIfNeeded();await capture('small-200-history-scrolled');
 // Pointer and keyboard hints must both be present and stay within the viewport.
 await open('narrow',520,728);const send=page.locator('.light-controls [data-action=share]');await send.hover();await page.locator('[role=tooltip]').waitFor();interactions.hoverTooltip=await page.locator('[role=tooltip]').textContent();await capture('desktop-hover-send');
 await page.mouse.move(2,2);await page.locator('.light-controls .search').focus();await page.keyboard.press('Tab');await page.keyboard.press('Tab');await page.locator('[role=tooltip]').waitFor();interactions.focusTooltip=await page.locator('[role=tooltip]').textContent();await capture('desktop-focus-send');await page.keyboard.press('Escape');interactions.escapeDismissedTooltip=await page.locator('[role=tooltip]').count()===0;
 await open('wide',1440,868);await page.locator('.wide-controls .search').fill('npm');await capture('wide-search');await page.locator('.wide-controls [data-query-clear]').click();interactions.wideClearReturnedFocus=await page.locator('.wide-controls .search').evaluate(e=>e===document.activeElement);
 await page.locator('[data-open]').first().click();await page.locator('.clip-dialog [data-action=close-detail]').hover();await page.locator('[role=tooltip]').waitFor();await capture('wide-detail-tooltip');await page.keyboard.press('Escape');
 // Verify the side-by-side reference remains available without changing old evidence.
 await page.goto(`${origin}?embed=1&variant=1&icons=text&surface=phone`);interactions.textReferencePreserved=await page.locator('.light-controls [data-action=share]').textContent()==='Share now'&&await page.locator('[data-copy]').first().textContent()==='Copy';
 await page.setViewportSize({width:1100,height:1050});await page.goto(`${origin}?variant=1&surface=phone`);await page.waitForSelector('iframe');await page.frames().find(f=>f.url().includes('embed=1')).waitForSelector('.app-frame');await page.screenshot({path:path.join(dir,'workbench.png'),fullPage:true});
 const failures=records.filter(r=>r.bodyScrollWidth>r.inner.w||r.content.scrollW>r.content.w+1||r.controlsOutsideBody.length||r.smallTouchTargets.length||r.unnamedIcons||r.overlaysOutsideViewport.length);
 const result={at:new Date().toISOString(),browser:browser.version(),fixture:'same nine synthetic Clips, no real clipboard or runtime mutation',records,interactions,errors,geometryFailures:failures.map(r=>r.id)};
 await fs.writeFile(path.join(dir,'measurements.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({captures:records.length,errors,failures,interactions}));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
