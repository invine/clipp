// Read-only geometry of the chosen prototype. No DOM or product mutation.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();const records=[],errors=[];page.on('pageerror',e=>errors.push(String(e)));
 for(const [surface,w,h] of [['small',320,640],['phone',360,720],['popup',480,600],['narrow',520,728],['wide',1440,868]])for(const scale of ['1','1.3','2']){
  await page.setViewportSize({width:w,height:h});await page.goto(`http://127.0.0.1:4195/?embed=1&icons=text&variant=1&surface=${surface}&scale=${scale}&scene=everyday&theme=dark`);await page.waitForSelector('[data-clip]');
  const data=await page.evaluate(()=>{
   const visible=s=>[...document.querySelectorAll(s)].find(e=>e.getBoundingClientRect().width>0);
   const rect=e=>{const r=e.getBoundingClientRect();return {w:Number(r.width.toFixed(2)),h:Number(r.height.toFixed(2)),x:Number(r.x.toFixed(2)),y:Number(r.y.toFixed(2))};};
   const share=visible('[data-action=share]'),copy=visible('[data-copy]');
   const target=parseFloat(getComputedStyle(document.body).getPropertyValue('--target'));
   return {target,share:rect(share),copy:rect(copy),search:rect(visible('input.search')),clipPreview:rect(visible('[data-clip] .clip-open')),firstClipY:visible('[data-clip]').getBoundingClientRect().y,estimatedWidthReleased:{share:Number(Math.max(0,share.getBoundingClientRect().width-target).toFixed(2)),copy:Number(Math.max(0,copy.getBoundingClientRect().width-target).toFixed(2))}};
  });records.push({surface,w,h,scale,evidenceClass:'read-only-browser-prototype-geometry',...data});
 }
 const out={at:new Date().toISOString(),browser:browser.version(),note:'Only current text-button geometry was measured. Width released estimates assume existing 40/48px square hit areas; no icon variant was rendered and no density/usability improvement is proven.',records,errors};
 await fs.writeFile(path.join(__dirname,'measurements.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
