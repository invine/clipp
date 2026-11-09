(async()=>{
 globalThis.nativeMeasure=async(id)=>{
  let last='',stable=0,g;
  for(let i=0;i<20;i++){
   g={windows:await options.evaluate(()=>chrome.windows.getAll()),dom:await options.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,screen:{width:screen.width,height:screen.height},scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}))};
   const value=JSON.stringify(g);stable=value===last?stable+1:0;last=value;if(stable>=3)break;await sleep(250);
  }
  await options.screenshot({path:path.join(dir,id+'.png')});
  out({case:id,at:new Date().toISOString(),stableSamples:stable,...g});
 };
 await nativeMeasure('restored-baseline');
})();
