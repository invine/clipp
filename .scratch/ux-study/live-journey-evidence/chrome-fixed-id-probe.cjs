// Read-only installed-ID probe for the exact user-supplied unpacked build.
// The owned browser opens only about:blank. No popup, options or web page is opened.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const originalPath = '/Users/invine/src/js/clipp/.local/managed-relay/worktrees/consolidated/apps/extension/dist';
let extensionPath;
const expected = 'gkmcpbabbekiafkmkgjmdlmdlijhjdle';
const evidence = path.join(__dirname, 'fixed-id');
async function manifestHash() {
  return crypto.createHash('sha256').update(await fs.readFile(path.join(extensionPath, 'manifest.json'))).digest('hex');
}
(async () => {
  await fs.mkdir(evidence,{recursive:true});
  extensionPath = await fs.mkdtemp(path.join(os.tmpdir(),'clipp-ux-fixed-id-build-'));
  await fs.cp(originalPath,extensionPath,{recursive:true});
  const fixedManifest = JSON.parse(await fs.readFile(path.join(extensionPath,'manifest.json'),'utf8'));
  fixedManifest.key = Buffer.from(originalPath,'utf8').toString('base64');
  await fs.writeFile(path.join(extensionPath,'manifest.json'),JSON.stringify(fixedManifest,null,2)+'\n');
  await fs.copyFile(path.join(__dirname,'../native-host-evidence/chrome/clipboard-guard.js'),path.join(extensionPath,'ux-clipboard-guard.js'));
  for(const file of ['src/popup.html','src/options.html','offscreen.html']) {
    const target=path.join(extensionPath,file);
    await fs.writeFile(target,(await fs.readFile(target,'utf8')).replace('<head>','<head><script src="/ux-clipboard-guard.js"></script>'));
  }
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clipp-ux-original-path-'));
  const before = await manifestHash();
  const manifest = JSON.parse(await fs.readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
  let context;
  const receipt = { at: new Date().toISOString(), extensionPath, originalPath, manifestKeyInput: "original user-supplied development path bytes, not a signing key", originalBuildModified: false, profile, registeredExtensionId: expected, manifestHasKey: !!manifest.key, manifestSha256Before: before, personalProfileAccessed: false, folderModified: false, popupOpened: false, webPagesOpened: false, signInAttempted: false };
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: false, viewport: null,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--window-size=1000,750']
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 });
    receipt.browser = context.browser().version();
    receipt.observed = await worker.evaluate(() => ({
      extensionId: chrome.runtime.id,
      redirectUrl: chrome.identity.getRedirectURL('clipp-relay'),
      version: chrome.runtime.getManifest().version
    }));
    receipt.installedIdMatchesRegistered = receipt.observed.extensionId === expected;
    receipt.redirectMatchesRegistered = receipt.observed.redirectUrl === `https://${expected}.chromiumapp.org/clipp-relay`;
    receipt.openPageUrls = context.pages().map(page => page.url());
  } catch (error) {
    receipt.error = String(error);
    process.exitCode = 1;
  } finally {
    if (context) { await context.close(); receipt.ownedBrowserClosed = true; }
    receipt.manifestSha256After = await manifestHash();
    receipt.manifestUnchanged = before === receipt.manifestSha256After;
    await fs.writeFile(path.join(evidence, 'chrome-folder-probe.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt));
  }
})();
