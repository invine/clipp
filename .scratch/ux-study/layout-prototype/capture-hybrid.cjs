// Render aid for the user-selected A+C direction, not native acceptance or an app test.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const dir=path.join(__dirname,'evidence','hybrid');await fs.mkdir(dir,{recursive:true});const records=[];
 const cases=[
  ['phone',360,720],['popup',480,600],['wide',1440,868],['fullscreen',1920,1080],
  ['narrow',520,728],['restored',900,668],['tab',1280,800],['tablet',1200,800],
  ['short',340,350],['landscape',640,360],['small',320,640],
  ['narrow',720,728],['narrow',721,728],['popup',600,600],['popup',601,600],
  ['small',320,640,'1.3','long','history','light'],
  ['small',320,640,'2','long','history','light'],
  ['phone',360,720,'2','recovery'],['wide',1440,868,'2','long'],
  ['narrow',721,728,'2','long'],['phone',360,720,'1','everyday','settings','light'],
  ['wide',1440,868,'1','long','history','light'],['phone',360,720,'1','empty'],
  ['popup',480,600,'1','nomatch'],['phone',360,720,'1','everyday','devices']
 ];
 for(const [surface,w,h,scale='1',scene='everyday',view='history',theme='dark'] of cases){
  await page.setViewportSize({width:w,height:h});const id=['D',surface,w,scale,scene,view,theme].join('-');
  await page.goto(`http://127.0.0.1:4195/?embed=1&variant=D&surface=${surface}&scale=${scale}&scene=${scene}&view=${view}&theme=${theme}`);
  await page.waitForSelector('.app-frame');await page.evaluate(()=>{scrollTo(0,0);return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
  await page.screenshot({path:path.join(dir,id+'.png')});
  const m=await page.evaluate(()=>{
   const content=document.querySelector('.content'),r=content.getBoundingClientRect();
   const cards=[...document.querySelectorAll('[data-clip]')].map(c=>c.getBoundingClientRect());
   const bar=document.querySelector('.compact-toolbar')?.getBoundingClientRect();
   const clipBottom=Math.min(r.bottom,innerHeight),clipTop=Math.max(r.top,0);
   const controls=[...document.querySelectorAll('button,input,select')].map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),r:e.getBoundingClientRect()})).filter(e=>e.r.width&&e.r.height);
   return {inner:{w:innerWidth,h:innerHeight},bodyScrollWidth:document.body.scrollWidth,content:{x:r.x,y:r.y,w:r.width,h:r.height,scrollW:content.scrollWidth,scrollH:content.scrollHeight},toolbar:bar?{y:bar.y,h:bar.height}:null,firstClipY:cards[0]?.y??null,columns:cards.filter(c=>Math.abs(c.y-cards[0].y)<1).length,cardHeights:cards.map(c=>Number(c.height.toFixed(2))),fullClips:cards.filter(c=>c.top>=clipTop&&c.bottom<=clipBottom&&c.left>=0&&c.right<=innerWidth).length,controlsOutsideBody:controls.filter(e=>e.r.left<-.5||e.r.right>innerWidth+.5).map(e=>e.label),smallTouchControls:document.body.classList.contains('touch')?controls.filter(e=>e.r.width<47.5||e.r.height<47.5).map(e=>({label:e.label,w:e.r.width,h:e.r.height})):[],topFont:getComputedStyle(document.documentElement).fontSize};
  });
  records.push({id,surface,scale,scene,view,theme,evidenceClass:'throwaway-browser-simulation',screenshot:id+'.png',...m});
 }
 await page.setViewportSize({width:320,height:640});await page.goto('http://127.0.0.1:4195/?embed=1&variant=D&surface=small&scale=2&scene=long&theme=light');await page.locator('[data-clip]').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,'D-large-text-history-scrolled.png')});
 await page.setViewportSize({width:1440,height:868});await page.goto('http://127.0.0.1:4195/?embed=1&variant=D&surface=wide&scene=long');
 await page.locator('[data-open]').first().click();const fullText=await page.locator('.detail-text').textContent();await page.screenshot({path:path.join(dir,'D-wide-full-clip.png')});await page.keyboard.press('Escape');
 await page.locator('[data-action="pinned"]').click();const pinnedVisible=await page.locator('[data-clip]').count();await page.locator('[data-action="all"]').click();await page.locator('.search').fill('npm run check');const searchVisible=await page.locator('[data-clip]:visible').count();await page.setViewportSize({width:520,height:728});const queryAfterResize=await page.locator('.search').inputValue();
 await page.locator('.search').fill('');await page.locator('[data-copy]').first().click();const copyFeedback=await page.locator('[role=status]').textContent();
 await page.setViewportSize({width:1100,height:1100});await page.goto('http://127.0.0.1:4195/?variant=D');await page.waitForSelector('iframe');await page.frames().find(f=>f.url().includes('embed=1')).waitForSelector('.app-frame');await page.screenshot({path:path.join(dir,'workbench.png'),fullPage:true});await page.locator('[data-cycle="1"]').click();await page.waitForURL(/variant=1/);const switched=await page.locator('.prototype-switcher strong').textContent();
 const interactions={fullTextUntruncated:fullText.includes('long-unbroken-reference-'.repeat(12)),pinnedVisible,searchVisible,queryAfterResize,copyFeedback,switched};
 const references=[];
 for(const variant of ['A','C'])for(const [surface,w,h] of [['phone',360,720],['popup',480,600],['wide',1440,868],['short',340,350]]){
  await page.setViewportSize({width:w,height:h});await page.goto(`http://127.0.0.1:4195/?embed=1&variant=${variant}&surface=${surface}`);await page.waitForSelector('[data-clip]');
  references.push({variant,surface,w,h,...await page.evaluate(()=>{const t=document.querySelector('.toolbar').getBoundingClientRect(),f=document.querySelector('.filter-row').getBoundingClientRect();return {controlsHeight:f.bottom-t.top,firstClipY:document.querySelector('[data-clip]').getBoundingClientRect().y}})});
 }
 await fs.writeFile(path.join(dir,'measurements.json'),JSON.stringify({at:new Date().toISOString(),browser:browser.version(),fixture:'same nine synthetic Clips; compare prototype variants only, never native before/after',records,references,interactions,errors},null,2));
 console.log(JSON.stringify({captures:records.length,errors,overflow:records.filter(r=>r.bodyScrollWidth>r.inner.w||r.content.scrollW>r.content.w+1||r.controlsOutsideBody.length).map(r=>({id:r.id,body:r.bodyScrollWidth,content:r.content,controls:r.controlsOutsideBody})),unequalWideCards:records.filter(r=>r.inner.w>720&&new Set(r.cardHeights).size>1).map(r=>r.id),smallTouchControls:records.filter(r=>r.smallTouchControls.length).map(r=>({id:r.id,controls:r.smallTouchControls})),interactions}));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
