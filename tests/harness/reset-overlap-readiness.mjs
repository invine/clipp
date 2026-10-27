import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
const out = mkdtempSync(join(tmpdir(), "clipp-readiness-"));
try {
  execFileSync(join(process.env.JAVA_HOME, "bin/javac"), [
    "-d",
    out,
    "apps/android/android/app/src/androidTest/java/com/clipp/app/ResetOverlapReadiness.java",
    "tests/fixtures/ResetOverlapReadinessFixture.java",
  ]);
  const expression = execFileSync(
    join(process.env.JAVA_HOME, "bin/java"),
    ["-cp", out, "com.clipp.app.ResetOverlapReadinessFixture"],
    { encoding: "utf8" }
  );
  const button = {
    disabled: false,
    getAttribute: () => null,
    textContent: "Continue reset overlap",
    closest: () => null,
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ x: 10, y: 20, width: 20, height: 20 }),
    contains: () => false,
  };
  let hit = button,
    modal = null,
    candidates = [button];
  const document = {
    querySelector: (s) => (s.startsWith("[role=") ? modal : null),
    querySelectorAll: () => candidates,
    elementFromPoint: () => hit,
  };
  const selector = `(() => { const root = document.querySelector('[role="dialog"][aria-modal="true"]') || document; return [...root.querySelectorAll('button')].find(e => !e.disabled && !e.closest('[inert], [hidden], [aria-hidden="true"]') && e.getClientRects().length && (e.getAttribute('aria-label') || e.textContent.trim()) === 'Continue reset overlap'); })()`;
  const original = `(() => { const e=${selector}; if(!e)return {ready:false};
    const r=e.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2, hit=document.elementFromPoint(x,y);
    return {x,y,width:innerWidth,height:innerHeight,rect:{x:r.x,y:r.y,width:r.width,height:r.height},
      shell:document.querySelector('.app-shell')?.className,
      ready:!e.disabled && !e.closest('[inert], [hidden], [aria-hidden=\"true\"]') && r.width>0 && r.height>0 && x>0 && y>0 && x<innerWidth && y<innerHeight && !!hit && (hit===e || e.contains(hit))}; })()`;
  const sample = (target = button) => {
    const context = {
      document,
      target,
      innerWidth: 100,
      innerHeight: 100,
      JSON,
    };
    const result = JSON.parse(vm.runInNewContext(expression, context));
    const baseline = vm.runInNewContext(original, context);
    if (JSON.stringify(result.sample) !== JSON.stringify(baseline))
      throw Error("changed stability sample");
    return result;
  };
  let value = sample();
  if (
    !value.sample.ready ||
    !value.vector.hitTarget ||
    !value.vector.documentCandidate ||
    !value.vector.scopeCandidate
  )
    throw Error("ready");
  hit = {};
  value = sample();
  if (value.sample.ready || value.vector.hitTarget) throw Error("covered");
  modal = { querySelectorAll: () => [] };
  value = sample();
  if (!value.vector.documentCandidate || value.vector.scopeCandidate)
    throw Error("modal scope");
  candidates = [];
  value = sample();
  if (value.vector.documentCandidate) throw Error("missing");
  modal = null;
  candidates = [];
  sample(null);
  candidates = [button];
  button.disabled = true;
  value = sample();
  if (
    !value.vector.scopeDisabled ||
    value.vector.selected ||
    value.sample.ready
  )
    throw Error("disabled");
  button.disabled = false;
  button.closest = () => ({});
  value = sample();
  if (!value.vector.scopeHidden || value.vector.selected || value.sample.ready)
    throw Error("hidden");
  button.closest = () => null;
  button.getClientRects = () => [];
  value = sample();
  if (value.vector.scopeHasRects || value.vector.selected)
    throw Error("empty client rects");
  if (JSON.stringify(value.vector).includes("Continue reset overlap"))
    throw Error("content leak");
  console.log("finite readiness vectors passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
