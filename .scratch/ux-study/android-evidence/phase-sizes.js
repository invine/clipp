(async()=>{
// Native display overrides on this owned AVD; no CDP device emulation.
for(const [w,h,dpi] of [[393,800,480],[412,915,480],[600,800,320],[840,1100,320],[1200,800,240]]){
 await shell('wm','size',Math.round(w*dpi/160)+'x'+Math.round(h*dpi/160));await shell('wm','density',String(dpi));await sleep(2500);await connect();await findClient();
 if(await evaluate("!!document.querySelector('.drawer-pane')"))await evaluate("document.querySelector('.nav-drawer .nav-header button').click()");
 await capture(`native-size-${w}x${h}`,{scenario:'Native display-size override, retained eight-Clip history',viewportMethod:'wm size/density; real Android window/insets; virtual device, not physical hardware'});
 if(w<1100)await ensureDrawer();await capture(`native-size-${w}x${h}-navigation`,{scenario:'Navigation at controlled native display size'});
 await evaluate("(()=>{const p=document.querySelector('.drawer-pane,.app-main>.nav-pane');if(p)p.scrollTop=10000})()");await capture(`native-size-${w}x${h}-bottom`,{scenario:'Bottom controls at native display size'});
}
await shell('wm','size','1080x2160');await shell('wm','density','480');await sleep(2200);await connect();await findClient();
for(const scale of [1.3,2]){
 await shell('settings','put','system','font_scale',String(scale));await sleep(3000);await connect();await findClient();
 await capture(`native-font-${scale}-history`,{scenario:'Actual OS font scale; WebView response measured separately'});await ensureDrawer();await capture(`native-font-${scale}-drawer`,{scenario:'Native scaled text in navigation'});await evaluate("document.querySelector('.drawer-pane').scrollTop=10000");await capture(`native-font-${scale}-bottom`,{scenario:'Native scaled text in preferences and continuity'});
}
})();
