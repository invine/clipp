(async()=>{
await shell('cmd','statusbar','collapse');await ensureDrawer();await evaluate("[...document.querySelectorAll('.drawer-pane button')].find(e=>e.textContent.includes('Scan QR')).click()");await sleep(2500);await fs.writeFile(path.join(dir,'camera-permission.xml'),await uiTree());await nativeCapture('native-camera-permission',{scenario:'Actual camera permission dialog; emulated camera, no host camera'});
})();
