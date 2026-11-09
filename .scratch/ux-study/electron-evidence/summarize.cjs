const fs = require("node:fs");
const path = require("node:path");
const dir = __dirname,
  rows = fs
    .readFileSync(path.join(dir, "observations.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
const environment = JSON.parse(
    fs.readFileSync(path.join(dir, "environment.json"))
  ),
  source = JSON.parse(
    fs.readFileSync(path.join(dir, "source-build-receipt.json"))
  ),
  fixture = JSON.parse(fs.readFileSync(path.join(dir, "fixture-public.json")));
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]
  );
const findingFor = (r) => {
  const id = r.evidenceId;
  const patterns = [
    ["E01", /native-default-empty|native-font-failure/],
    ["E02", /banner-|copy-failure-banner|copy-partial-success/],
    ["E03", /^sizing-1100$/],
    ["E04", /^search-/],
    ["E05", /^relay-draft-/],
    ["E07", /reflow-320|minimum-zoom2|history-200/],
    ["E09", /^filtered-/],
    ["E10", /tray-configure/],
    ["E11", /rename-save-failure|pending-accept-failure|native-relay-invalid/],
    ["E12", /pending-main/],
    ["E14", /^dense-relay|^dense-drawer-bottom|^dense-sidebar/],
    ["E15", /measured-fullscreen|fullscreen-one/],
    ["E16", /auto-sync-off|sidebar-ordinary|dense-drawer-top/],
  ];
  return patterns.filter(([, re]) => re.test(id)).map(([id]) => id);
};
const zoomCrop = (r) => !r.captureMethod && r.geometry.native.zoom !== 1;
const ledger = rows.map((r) => ({
  evidenceId: r.evidenceId,
  scenario: r.scenario,
  fixture:
    r.fixture ??
    (r.evidenceClass === "native-isolated"
      ? "Fresh isolated native state"
      : "Public renderer fixture; see capture phases"),
  runtime: "electron",
  surface: r.evidenceId.includes("qr")
    ? "pairing-dialog"
    : r.evidenceId.includes("drawer")
      ? "settings-drawer"
      : "main-window",
  timestampUtc: r.timestampUtc,
  source: {
    head: source.head,
    diffSha256: source.trackedDiffSha256,
    manifest: "source-build-receipt.json",
    build: source.buildCommand,
  },
  environment: {
    os: environment.os + " " + environment.osVersion,
    runtimeVersion: environment.versions.electron,
    isolation: environment.profile,
    input: "pointer/keyboard via Playwright and owned native API",
    windowMode: r.geometry.native.fullscreen
      ? "fullscreen"
      : r.geometry.native.maximized
        ? "maximized"
        : "restored",
    outerBounds: r.geometry.native.outer,
    contentBounds: r.geometry.native.content,
    viewportCss: { width: r.geometry.dom.width, height: r.geometry.dom.height },
    visualViewport: r.geometry.dom.visualViewport,
    physicalResolution: null,
    dpr: r.geometry.dom.dpr,
    displayScale: 2,
    pageZoom: r.geometry.native.zoom,
    fontScale: null,
    androidWindowDp: null,
    systemInsets: null,
    keyboardInsets: null,
  },
  preconditions: [
    r.evidenceClass === "native-isolated"
      ? "Native app, new profile, memory clipboard, empty relays"
      : "Built native app window; external fonts supplied locally; public IPC fixtures after phase-sizes",
    `Fixture clock: ${r.evidenceClass === "native-isolated" ? "real capture time" : fixture.clock}`,
  ],
  steps: [
    "See the named screenshot reproduction in ../electron-observations.md and retained phase scripts.",
  ],
  expected:
    r.expected ??
    "Record actual geometry and rendered state for the observation; this is not a complete scenario acceptance test.",
  actual:
    r.actual ??
    `Captured ${r.geometry.dom.width}×${r.geometry.dom.height} CSS px; ${r.geometry.visibility?.fullCards ?? "not ancestor-verified"} fully visible cards.`,
  outcome: r.outcome ?? (findingFor(r).length ? "fail" : "pass"),
  outcomeScope:
    "A fail points to a finding/example in the report; other pass records mean the requested observation was captured, not that the entire flow is defect-free.",
  evidenceClass: r.evidenceClass,
  artifacts: [r.screenshot, "observations.jsonl", "trace.jsonl"],
  impact: findingFor(r).length
    ? "See linked findings"
    : "Measurement or bounded positive check",
  confidence: "observed",
  sourcePointers: ["source-build-receipt.json", "../flow-control-inventory.md"],
  recommendation: "Use as input to the later control/layout decisions.",
  findings: findingFor(r),
  limitations: [
    ...(r.limitations ?? []),
    ...(zoomCrop(r)
      ? [
          "Playwright zoom screenshot cropped; use native replacement and DOM geometry.",
        ]
      : []),
    ...(r.geometry.visibility
      ? []
      : [
          "Raw fullyVisibleCards ignores clipping ancestors; do not use as final density count.",
        ]),
    ...(r.evidenceClass === "rendered-fixture"
      ? ["Not live auth/pairing/storage/notification acceptance."]
      : []),
  ],
  captureMethod: r.captureMethod ?? "Playwright.page.screenshot",
  captureSize: r.captureSize ?? null,
}));
fs.writeFileSync(
  path.join(dir, "evidence.jsonl"),
  ledger.map((r) => JSON.stringify(r)).join("\n") + "\n"
);
const cards = rows
  .map(
    (r) =>
      `<figure data-text="${esc(r.evidenceId + " " + r.scenario + " " + r.evidenceClass + " " + findingFor(r).join(" "))}"><a href="${esc(r.screenshot)}"><img loading="lazy" src="${esc(r.screenshot)}" alt="${esc(r.scenario)}"></a><figcaption><strong>${esc(r.evidenceId)}</strong><p>${esc(r.scenario)}</p><small>${esc(r.evidenceClass)} · ${r.geometry.dom.width}×${r.geometry.dom.height} CSS · zoom ${r.geometry.native.zoom} · DPR ${r.geometry.dom.dpr}<br>${esc(findingFor(r).join(", "))}${zoomCrop(r) ? "<br><b>Superseded zoom image: capture cropped. Use native replacement.</b>" : ""}</small></figcaption></figure>`
  )
  .join("\n");
fs.writeFileSync(
  path.join(dir, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Clipp — Electron UX evidence</title><style>body{font:16px system-ui;margin:32px;background:#11151f;color:#e8ebf1}a{color:#abbcff}header{max-width:950px}input{padding:12px;width:min(90%,640px);margin:12px 0;background:#222b3c;border:1px solid #7381a0;border-radius:8px;color:inherit}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:24px}figure{margin:0;padding:14px;background:#1d2432;border-radius:12px}img{width:100%;height:330px;object-fit:contain;background:#0c0c10}p{line-height:1.5}small{color:#bcc5d8}figcaption{margin-top:12px;overflow-wrap:anywhere}[hidden]{display:none}</style><header><h1>Clipp: Electron UX evidence</h1><p>76 observations on macOS / Electron 43.4.0. Eight native-isolated captures; other captures use font/state fixtures. Click a screenshot for its full size. Native window size, CSS viewport and DPR are different measurements.</p><p><a href="../electron-observations.md">Findings and limitations</a> · <a href="evidence.jsonl">Evidence ledger</a> · <a href="README.md">Reproduction notes</a></p><label>Filter by scenario, capture name, evidence class or finding <input id="filter" placeholder="e.g. E02, reflow, drawer, native-isolated"></label><p id="count"></p></header><main>${cards}</main><script>const f=document.querySelector('#filter'),cards=[...document.querySelectorAll('figure')];f.oninput=()=>{let n=0;for(const c of cards){c.hidden=!c.dataset.text.toLowerCase().includes(f.value.toLowerCase());if(!c.hidden)n++}document.querySelector('#count').textContent=n+' observations'};f.oninput();</script></html>`
);
console.log(
  JSON.stringify({
    observations: rows.length,
    uniqueIds: new Set(rows.map((r) => r.evidenceId)).size,
    missingScreenshots: rows
      .filter((r) => !fs.existsSync(path.join(dir, r.screenshot)))
      .map((r) => r.evidenceId),
  })
);
