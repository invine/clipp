// Native local-journey observer. UI input is supplied separately through CUA.
const fs = require('node:fs/promises');
const syncfs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { chromium } = require('playwright');
const dir = path.join(__dirname, 'manual-load');
let context, worker, profile, extensionId;
function out(value) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...value });
  syncfs.appendFileSync(path.join(dir, 'local-journey-trace.jsonl'), line + '\n');
  console.log(line);
}
async function optionPage() {
  const page = context.pages().find(p => p.url() === `chrome-extension://${extensionId}/src/options.html`);
  if (!page) throw new Error('Options is not open');
  return page;
}
async function capture(id) {
  const page = await optionPage();
  await page.screenshot({ path: path.join(dir, id + '.png') });
  out({ capture: id, geometry: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, clipboardGuard: !!globalThis.__uxClipboard })) });
}
async function quit() {
  await context.close();
  await fs.writeFile(path.join(dir, 'local-journey-closed.json'), JSON.stringify({ at: new Date().toISOString(), closed: true }));
  out({ closed: true });
  process.exit(0);
}
(async () => {
  await fs.mkdir(dir, {recursive:true});
  profile = await fs.mkdtemp(path.join(require('node:os').tmpdir(),'clipp-ux-manual-load-'));
  context = await chromium.launchPersistentContext(profile, {
    headless:false, viewport:null, ignoreDefaultArgs:['--disable-extensions'], args:['--window-size=1100,820']
  });
  await context.addInitScript({path:path.join(__dirname,'../native-host-evidence/chrome/clipboard-guard.js')});
  out({ready:true,profile,mode:'native Load unpacked, fresh profile'});
  const lines = readline.createInterface({ input: process.stdin, terminal: false });
  let queue = Promise.resolve();
  lines.on('line', line => {
    queue = queue.then(async () => {
      try { const result = await eval('(async()=>{' + line + '})()'); if (result !== undefined) out(result); }
      catch (error) { out({ error: String(error) }); }
      out({ commandDone: true });
    });
  });
})().catch(error => { console.error(String(error)); process.exitCode = 1; });
