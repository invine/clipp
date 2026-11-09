// Visual inspection aid for the throwaway prototype, not a production acceptance test.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 const dir=path.join(__dirname,'evidence');await fs.mkdir(dir,{recursive:true});const records=[];
 const cases=[['phone',360,720,'1','everyday','history','dark'],['popup',480,600,'1','everyday','history','dark'],['wide',1440,868,'1','everyday','history','dark'],['small',320,640,'2','long','history','light'],['short',340,350,'1','everyday','history','dark'],['phone',360,720,'2','recovery','history','dark'],['phone',360,720,'1','everyday','settings','light']];
 for(const variant of ['A','B','C'])for(const [surface,w,h,scale,scene,view,theme] of cases){
  await page.setViewportSize({width:w,height:h});const id=[variant,surface,scale,scene,view,theme].join('-');
  await page.goto(`http://127.0.0.1:4195/?embed=1&variant=${variant}&surface=${surface}&scale=${scale}&scene=${scene}&view=${view}&theme=${theme}`);await page.waitForSelector('.app-frame');await page.evaluate(()=>{scrollTo(0,0);return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
  await page.screenshot({path:path.join(dir,id+'.png')});
  const measure=await page.evaluate(()=>{const content=document.querySelector('.content');const r=content.getBoundingClientRect();const cards=[...document.querySelectorAll('[data-clip]')];return {inner:{w:innerWidth,h:innerHeight},scrollY,bodyScrollWidth:document.body.scrollWidth,content:{x:r.x,y:r.y,w:r.width,h:r.height,scrollW:content.scrollWidth,scrollH:content.scrollHeight},fullClips:cards.filter(c=>{const q=c.getBoundingClientRect();return q.top>=Math.max(r.top,0)&&q.bottom<=Math.min(r.bottom,innerHeight)&&q.left>=Math.max(r.left,0)&&q.right<=Math.min(r.right,innerWidth)}).length,visibleClips:cards.filter(c=>{const q=c.getBoundingClientRect();return q.bottom>Math.max(r.top,0)&&q.top<Math.min(r.bottom,innerHeight)}).length,controlsOutsideBody:[...document.querySelectorAll('button,input,select')].filter(e=>{const q=e.getBoundingClientRect();return q.width&&q.height&&(q.left<-.5||q.right>innerWidth+.5)}).map(e=>({label:e.getAttribute('aria-label')||e.textContent.slice(0,50),x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width})),topFont:getComputedStyle(document.documentElement).fontSize};});
  records.push({id,variant,surface,scale,scene,view,theme,evidenceClass:'throwaway-browser-simulation',screenshot:id+'.png',...measure});
 }
 await page.setViewportSize({width:320,height:640});await page.goto('http://127.0.0.1:4195/?embed=1&variant=A&surface=small&scale=2&scene=long&theme=light');await page.waitForSelector('[data-clip]');await page.locator('[data-clip]').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,'A-large-text-history-scrolled.png')});
 // Actual demo interactions, no native or backend claims.
 await page.setViewportSize({width:1100,height:1100});await page.goto('http://127.0.0.1:4195/');await page.waitForSelector('iframe');const frame=page.frames().find(f=>f.url().includes('embed=1'));await frame.waitForSelector('.app-frame');await page.screenshot({path:path.join(dir,'workbench.png'),fullPage:true});
 await frame.locator('[data-copy]').first().click();const copyFeedback=await frame.locator('[role=status]').textContent();
 await page.locator('[data-cycle="1"]').click();await page.waitForURL(/variant=B/);
 const switched=await page.locator('.prototype-switcher strong').textContent();
 await fs.writeFile(path.join(dir,'measurements.json'),JSON.stringify({at:new Date().toISOString(),browser:browser.version(),fixture:'nine synthetic Clips from app.js; compare variants only, not a native before/after benchmark',records,interactions:{copyFeedback,switched},errors},null,2));
 console.log(JSON.stringify({captures:records.length,errors,overflow:records.filter(r=>r.bodyScrollWidth>r.inner.w||r.content.scrollW>r.content.w+1||r.controlsOutsideBody.length).map(r=>({id:r.id,body:r.bodyScrollWidth,contentW:r.content.w,scrollW:r.content.scrollW,controls:r.controlsOutsideBody})),interactions:{copyFeedback,switched}}));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
