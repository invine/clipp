import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
const root = fileURLToPath(new URL('.', import.meta.url));
await writeFile(root+'current-icon.png', await readFile(root+'../clipp-purple-512.png'));
// Trace the original white C at subpixel resolution; do not regularize or rotate it.
const original=PNG.sync.read(await readFile(root+'../clipp-purple-512.png'));
const segments=[];
const v=(x,y)=>original.data[(y*512+x)*4]*original.data[(y*512+x)*4+3]/255-170;
const key=p=>p.map(x=>x.toFixed(4)).join(',');
for(let y=0;y<511;y++)for(let x=0;x<511;x++){
 const points=[[x+.5,y+.5],[x+1.5,y+.5],[x+1.5,y+1.5],[x+.5,y+1.5]];
 const values=[v(x,y),v(x+1,y),v(x+1,y+1),v(x,y+1)];
 const hits=[];
 for(let k=0;k<4;k++){const j=(k+1)%4;if((values[k]>0)!==(values[j]>0)){
 const t=values[k]/(values[k]-values[j]);hits.push([points[k][0]+t*(points[j][0]-points[k][0]),points[k][1]+t*(points[j][1]-points[k][1])]);}}
 if(hits.length===2)segments.push(hits);
}
const adj=new Map();
for(const [a,b] of segments){const ka=key(a),kb=key(b);if(ka===kb)continue;if(!adj.has(ka))adj.set(ka,[]);if(!adj.has(kb))adj.set(kb,[]);if(!adj.get(ka).includes(kb))adj.get(ka).push(kb);if(!adj.get(kb).includes(ka))adj.get(kb).push(ka);}
const first=adj.keys().next().value, contour=[first];let prior=null,current=first;
do {const next=adj.get(current).find(k=>k!==prior);prior=current;current=next;if(current!==first)contour.push(current);}while(current!==first&&contour.length<10000);
if(contour.length<500||contour.length>=10000)throw new Error('Unexpected original C contour');
const cPath='M'+contour.map(p=>p.split(',').map(Number).map(n=>n.toFixed(2)).join(' ')).join(' L')+' Z';
const mark='<path d="'+cPath+'" fill="#F9FAFB"/><circle cx="390" cy="247" r="28" fill="#22C55E"/>';
const options=[
 {id:'a-violet',name:'A · Violet',tag:'Flat and familiar',description:'One solid violet field. Original C silhouette, tilt and green-dot placement retained.',background:'#6735CC'},
 {id:'b-depth',name:'B · Depth',tag:'Closest to the original',description:'A quieter version of the purple gradient. The original tilted mark stays intact.',background:'url(#depth)',defs:'<defs><linearGradient id="depth" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#262653"/><stop offset=".5" stop-color="#443293"/><stop offset="1" stop-color="#7728D3"/></linearGradient></defs>'},
 {id:'c-ink',name:'C · Ink',tag:'Deeper and quieter',description:'A deep plum field gives the original white C and green dot more contrast.',background:'#40256E'}
];
const svg=o=>'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'+(o.defs||'')+'<rect x="36" y="36" width="440" height="440" rx="122" fill="'+o.background+'"/>'+mark+'</svg>';
await writeFile(root+'original-c-path.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'+mark+'</svg>');
console.log(JSON.stringify({tracedPoints:contour.length,dot:{cx:390,cy:247,r:28},geometry:'shared unchanged across every option'}));
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
const styles = `*{box-sizing:border-box}body{margin:0;background:#f4f3f1;color:#202023;font-family:Arial,Helvetica,sans-serif}main{padding:40px;max-width:1520px;margin:auto}h1{font-size:64px;letter-spacing:-3px;line-height:1;margin:0 0 20px}header p{font-size:18px;line-height:1.5;margin:0;max-width:760px}header{margin-bottom:32px}.options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}h2{font-size:26px;letter-spacing:-.7px;margin:20px 0 10px}.description{font-size:16px;line-height:1.5;margin:0;min-height:96px}.large{display:flex;align-items:center;justify-content:center;height:224px;background:#e8e6e4}.large img{width:208px;height:208px}.tag{font-size:16px;margin:16px 0 0;font-weight:700}.sample{padding:20px 16px;background:#fff;margin-top:18px}.sample.dark{background:#202023;color:#fff;margin-top:8px}.sizes{display:flex;gap:20px;align-items:end;height:64px}.unit{display:flex;flex-direction:column;align-items:center;gap:8px}.unit span{font-size:13px}.sample p{font-size:14px;margin:0 0 12px}.original{display:flex;align-items:center;gap:20px;margin-top:32px;background:#e8e6e4;padding:16px 24px}.original img{width:72px;height:72px}.original p{max-width:70ch;font-size:16px;line-height:1.5;margin:0}.original strong{display:block;margin-bottom:4px}footer{font-size:14px;margin-top:24px;line-height:1.5}@media(max-width:1000px){main{padding:32px}.options{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}.description{min-height:72px}}@media(max-width:540px){main{padding:24px}h1{font-size:38px;letter-spacing:-1.5px}.options{grid-template-columns:1fr;gap:36px}.description{min-height:0}.large{height:250px}.large img{width:224px;height:224px}.original{padding:16px;gap:12px}.original img{width:56px;height:56px}}`;
const samples=o=>[false,true].map(dark=>`<div class="sample ${dark?'dark':''}"><p>${dark?'Dark surface':'Light surface'} · actual pixel sizes</p><div class="sizes">${[16,24,32,48].map(s=>`<div class="unit"><img src="${o.id}/icon-${s}.png" width="${s}" height="${s}" alt="${o.name} at ${s} pixels"><span>${s}</span></div>`).join('')}</div></div>`).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clipp icon directions</title><style>${styles}</style><main><header><h1>Keep the character.</h1><p>The original tilted C and green-dot placement stay fixed. Three finishes, one preserved mark.</p></header><div class="options">${options.map(o=>`<section><div class="large"><img src="${o.id}/icon-512.png" alt="${o.name} icon"></div><h2>${o.name}</h2><p class="description">${o.description}</p><p class="tag">${o.tag}</p>${samples(o)}</section>`).join('')}</div><aside class="original"><img src="current-icon.png" alt="Current Clipp icon"><p><strong>Current icon</strong>The reference geometry: the tilted C, its asymmetric opening, and the green dot retain their original relationship.</p></aside><footer>Editable SVG masters · Transparent PNGs from 16 to 1024 pixels · Proposals for review</footer></main></html>`;
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
