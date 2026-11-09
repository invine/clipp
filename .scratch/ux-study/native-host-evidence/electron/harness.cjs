// Study-only native Electron harness. No application source is changed.
// Launch: node .scratch/ux-study/electron-evidence/harness.cjs
// Commands arrive on stdin as one line of JavaScript; all objects are study-owned.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { _electron } = require("playwright");
const readline = require("node:readline");
const root = path.resolve(__dirname, "../../../..");
const dir = __dirname;
let electron, page, profile, base, fixture;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (x) => console.log(JSON.stringify(x));
async function init() {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "clipp-ux-electron-"));
  const launch = path.join(profile, "launch.cjs");
  await fs.writeFile(
    launch,
    `const {app,clipboard,Menu}=require('electron');
app.setName('Clipp UX Study');
let value=''; clipboard.readText=()=>value; clipboard.writeText=text=>{value=text;};
globalThis.__uxMenus=[]; const build=Menu.buildFromTemplate;
Menu.buildFromTemplate=function(t){const m=build.call(this,t);globalThis.__uxMenus.push(m);return m;};
require(${JSON.stringify(path.join(root, "apps/electron/dist/main.cjs"))});`,
    { mode: 0o600 }
  );
  electron = await _electron.launch({
    args: [launch],
    cwd: root,
    env: {
      ...process.env,
      CLIPP_LOG_LEVEL: "error",
      CLIPP_RELAY_ACCEPTANCE_TRANSPORT: "wss",
      CLIPP_RELAY_ACCEPTANCE_PROFILE: profile,
    },
    timeout: 30000,
  });
  page = await electron.firstWindow();
  await page.waitForFunction(() => window.clipp?.getState);
  base = await page.evaluate(() => window.clipp.getState());
  const environment = await electron.evaluate(
    ({ app, screen, BrowserWindow }) => ({
      os: process.platform,
      osVersion: process.getSystemVersion(),
      arch: process.arch,
      versions: process.versions,
      displays: screen.getAllDisplays(),
      outer: BrowserWindow.getAllWindows()[0].getBounds(),
      content: BrowserWindow.getAllWindows()[0].getContentBounds(),
    })
  );
  await fs.writeFile(
    path.join(dir, "environment.json"),
    JSON.stringify(
      {
        ...environment,
        profile,
        clipboard: "memory only",
        network: "relay-only, empty managed configuration",
      },
      null,
      2
    )
  );
  out({ ready: true, profile, environment, baseKeys: Object.keys(base) });
}
async function geometry() {
  return {
    native: await electron.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return {
        outer: w.getBounds(),
        content: w.getContentBounds(),
        maximized: w.isMaximized(),
        fullscreen: w.isFullScreen(),
        zoom: w.webContents.getZoomFactor(),
      };
    }),
    dom: await page.evaluate(() => {
      const rect = (e) => {
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          display: s.display,
          scrollH: e.scrollHeight,
          clientH: e.clientHeight,
          scrollW: e.scrollWidth,
          clientW: e.clientWidth,
        };
      };
      const cards = [...document.querySelectorAll(".history-card")];
      return {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        visualViewport: {
          width: visualViewport.width,
          height: visualViewport.height,
          scale: visualViewport.scale,
        },
        fontSize: getComputedStyle(document.body).fontSize,
        scroll: {
          w: document.documentElement.scrollWidth,
          h: document.documentElement.scrollHeight,
        },
        areas: Object.fromEntries(
          [
            ".app-bar",
            ".app-main",
            ".content-header",
            ".content-filters",
            ".history-grid",
            ".nav-pane",
            ".nav-drawer",
            ".search-field",
            ".qr-modal",
            ".modal-backdrop",
          ].map((s) => [
            s,
            document.querySelector(s) ? rect(document.querySelector(s)) : null,
          ])
        ),
        cards: cards.length,
        fullyVisibleCards: cards.filter((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            r.left >= 0 &&
            r.right <= innerWidth
          );
        }).length,
        alerts: [...document.querySelectorAll(".initialization-error")].map(
          (e) => ({ text: e.innerText, ...rect(e) })
        ),
        focus: document.activeElement?.outerHTML.slice(0, 250),
      };
    }),
  };
}
async function snap(id, details = {}) {
  await sleep(150);
  const shot = path.join(dir, id + ".png");
  await page.screenshot({ path: shot });
  const record = {
    evidenceId: id,
    timestampUtc: new Date().toISOString(),
    ...details,
    geometry: await geometry(),
    screenshot: id + ".png",
  };
  await fs.appendFile(
    path.join(dir, "observations.jsonl"),
    JSON.stringify(record) + "\n"
  );
  out(record);
  return record;
}
async function size(w, h) {
  await electron.evaluate(
    ({ BrowserWindow }, [w, h]) =>
      BrowserWindow.getAllWindows()[0].setContentSize(w, h),
    [w, h]
  );
  await page
    .waitForFunction(
      ([w, h]) => innerWidth === w && innerHeight === h,
      [w, h],
      { timeout: 3000 }
    )
    .catch(() => {});
  await sleep(100);
}
async function inject(state) {
  fixture = structuredClone(state);
  await electron.evaluate(({ BrowserWindow }, s) => {
    globalThis.__uxState = s;
    BrowserWindow.getAllWindows()[0].webContents.send("clipp:update", s);
  }, fixture);
  await sleep(100);
}
async function quit() {
  if (electron) {
    await Promise.race([
      electron.close(),
      sleep(10000).then(() => {
        electron.process().kill("SIGTERM");
      }),
    ]);
  }
  out({ closed: true });
  process.exit(0);
}
process.on("unhandledRejection", (e) => out({ unhandled: String(e) }));
init()
  .then(() => {
    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });
    let chain = Promise.resolve();
    rl.on("line", (line) => {
      chain = chain.then(async () => {
        try {
          const result = await eval("(async()=>{" + line + "})()");
          if (result !== undefined) out(result);
        } catch (e) {
          out({ error: e.stack });
        }
        out({ commandDone: true });
      });
    });
  })
  .catch((e) => {
    out({ launchError: e.stack });
    process.exit(1);
  });
