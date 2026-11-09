import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('.', import.meta.url));
await writeFile(root+'current-icon.png', await readFile(root+'../clipp-purple-512.png'));
// Reuse the selected SVG verbatim for all foreground geometry; do not retrace it.
const selected=await readFile(root+'../refresh-preserved/b-depth/icon.svg','utf8');
const mark=selected.slice(selected.indexOf('<path'),selected.lastIndexOf('</svg>'));
if(!mark.startsWith('<path') || !mark.endsWith('<circle cx="390" cy="247" r="28" fill="#22C55E"/>'))throw new Error('Selected B geometry does not match the locked source');
const refinedDefs='<defs><linearGradient id="depth-refined" gradientUnits="userSpaceOnUse" x1="66" y1="46" x2="452" y2="472"><stop stop-color="#222249"/><stop offset=".30" stop-color="#303674"/><stop offset=".65" stop-color="#50339D"/><stop offset="1" stop-color="#7630D3"/></linearGradient><radialGradient id="cool-core" gradientUnits="userSpaceOnUse" cx="240" cy="225" r="260"><stop stop-color="#315AA2" stop-opacity=".34"/><stop offset="1" stop-color="#315AA2" stop-opacity="0"/></radialGradient></defs>';
const tile='<rect x="36" y="36" width="440" height="440" rx="122"';
const refined='<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'+refinedDefs+tile+' fill="url(#depth-refined)"/>'+tile+' fill="url(#cool-core)"/>'+mark+'</svg>';
const options=[
 {id:'selected-b',name:'B · Selected',tag:'Previous version',description:'The direction you selected: a simple diagonal transition from dark purple to violet.',source:selected},
 {id:'refined-b',name:'B · Refined',tag:'Recommended refinement',description:'A cooler blue-purple center, a deeper upper corner, and a softer transition into violet.',source:refined}
];
const svg=o=>o.source;
const geometry=options.map(o=>o.source.slice(o.source.indexOf('<path')));
if(!geometry.every(g=>g===geometry[0]))throw new Error('Foreground geometry changed');
await writeFile(root+'geometry-check.json',JSON.stringify({source:'../refresh-preserved/b-depth/icon.svg',identicalForeground:true,cPath:'unchanged',dot:{cx:390,cy:247,r:28,fill:'#22C55E'},white:'#F9FAFB',tile:{x:36,y:36,width:440,height:440,rx:122}},null,2)+'\n');
console.log('Verified: exact same C path and dot attributes as selected B.');
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage();
for (const o of options) {
 await mkdir(root+o.id,{recursive:true});
 const source = svg(o);
 await writeFile(root+o.id+'/icon.svg',source);
 const sizes=[16,24,32,48,64,128,256,512,1024];
 for (const size of sizes) {
 const png = await page.evaluate(async ({source,size}) => {
 const img = new Image(); img.src='data:image/svg+xml;base64,'+btoa(source); await img.decode();
 const canvas = document.createElement('canvas'); canvas.width=size;canvas.height=size;
 canvas.getContext('2d').drawImage(img,0,0,size,size);return canvas.toDataURL('image/png').split(',')[1];
 },{source,size});
 await writeFile(root+o.id+`/icon-${size}.png`,Buffer.from(png,'base64'));
 }
}
const styles = `*{box-sizing:border-box}body{margin:0;background:#f4f3f1;color:#202023;font-family:Arial,Helvetica,sans-serif}main{padding:40px;max-width:1160px;margin:auto}h1{font-size:64px;letter-spacing:-3px;line-height:1;margin:0 0 20px}header p{font-size:18px;line-height:1.5;margin:0;max-width:760px}header{margin-bottom:32px}.options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}h2{font-size:26px;letter-spacing:-.7px;margin:20px 0 10px}.description{font-size:16px;line-height:1.5;margin:0;min-height:72px}.large{display:flex;align-items:center;justify-content:center;height:310px;background:#e8e6e4}.large img{width:280px;height:280px}.tag{font-size:16px;margin:16px 0 0;font-weight:700}.sample{padding:20px 16px;background:#fff;margin-top:18px}.sample.dark{background:#202023;color:#fff;margin-top:8px}.sizes{display:flex;gap:20px;align-items:end;height:64px}.unit{display:flex;flex-direction:column;align-items:center;gap:8px}.unit span{font-size:13px}.sample p{font-size:14px;margin:0 0 12px}.original{display:flex;align-items:center;gap:20px;margin-top:32px;background:#e8e6e4;padding:16px 24px}.original img{width:72px;height:72px}.original p{max-width:70ch;font-size:16px;line-height:1.5;margin:0}.original strong{display:block;margin-bottom:4px}footer{font-size:14px;margin-top:24px;line-height:1.5}@media(max-width:1000px){main{padding:32px}.options{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}.description{min-height:72px}}@media(max-width:540px){main{padding:24px}h1{font-size:38px;letter-spacing:-1.5px}.options{grid-template-columns:1fr;gap:36px}.description{min-height:0}.large{height:250px}.large img{width:224px;height:224px}.original{padding:16px;gap:12px}.original img{width:56px;height:56px}}`;
const samples=o=>[false,true].map(dark=>`<div class="sample ${dark?'dark':''}"><p>${dark?'Dark surface':'Light surface'} · actual pixel sizes</p><div class="sizes">${[16,24,32,48].map(s=>`<div class="unit"><img src="${o.id}/icon-${s}.png" width="${s}" height="${s}" alt="${o.name} at ${s} pixels"><span>${s}</span></div>`).join('')}</div></div>`).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clipp — refined Depth icon</title><style>${styles}</style><main><header><h1>Depth, refined.</h1><p>A more balanced purple field. The original C tilt, opening and green-dot placement stay fixed.</p></header><div class="options">${options.map(o=>`<section><div class="large"><img src="${o.id}/icon-512.png" alt="${o.name} icon"></div><h2>${o.name}</h2><p class="description">${o.description}</p><p class="tag">${o.tag}</p>${samples(o)}</section>`).join('')}</div><aside class="original"><img src="current-icon.png" alt="Current Clipp icon"><p><strong>Current icon</strong>The original remains the reference for the tilted C and green dot. This refinement changes only the background.</p></aside><footer>Editable SVG masters · Transparent PNGs from 16 to 1024 pixels · Proposals for review</footer></main></html>`;
await writeFile(root+'index.html',html);
await page.goto('file://'+root+'index.html');
await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
for (const width of [1440,768,390]) {
 await page.setViewportSize({width,height:1000});
 await page.setViewportSize({width,height:await page.evaluate(()=>document.documentElement.scrollHeight)});
 await page.waitForTimeout(400);
 await page.screenshot({path:root+`comparison-${width}.png`});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 console.log(JSON.stringify({width,overflow}));
}
await browser.close();
