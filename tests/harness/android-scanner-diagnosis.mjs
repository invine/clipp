// Preparation only: builds a diagnostic bundle without browser, native or camera access.
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const repo = fileURLToPath(new URL("../..", import.meta.url));
if (!process.argv[2]) throw new Error("diagnostic_output_directory_required");
const out = resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
// Exercise the accepted generator with the repository's public signed target.
// No account, device storage, networking or live target is used.
const generated = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {encodePairingTarget,decodePairingTarget} from ${JSON.stringify(`${repo}/packages/core/pairing/v2.ts`)};
import {createPairingCode} from ${JSON.stringify(`${repo}/packages/core/pairing/qrCode.ts`)};
const fixture=JSON.parse(readFileSync(${JSON.stringify(`${repo}/tests/core/pairing/fixtures/signed-qr-target.json`)},'utf8'));
const target={targetPeerId:fixture.targetPeerId,signedPeerRecord:new Uint8Array(Buffer.from(fixture.signedPeerRecord,'base64'))};
const text=encodePairingTarget(target);const code=await createPairingCode(text);
assert.ok(code.image,'accepted generator must provide an image');
assert.equal(code.text,text);
const pngBase64=code.image.split(',')[1];const pixels=PNG.sync.read(Buffer.from(pngBase64,'base64'));
const qrText=jsQR(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height)?.data;
assert.ok(qrText,'generated pixels must decode');
const decoded=decodePairingTarget(qrText);
assert.equal(decoded.targetPeerId,target.targetPeerId);
assert.deepEqual(decoded.signedPeerRecord,target.signedPeerRecord);
console.log(JSON.stringify({pngBase64,qrText,targetPeerId:target.targetPeerId,signedPeerRecordSha256:createHash('sha256').update(target.signedPeerRecord).digest('hex'),generator:'createPairingCode(encodePairingTarget(public signed fixture))'}));
`,
    ],
    { cwd: repo, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
  )
);
const expected = generated.qrText;
const pngBytes = Buffer.from(generated.pngBase64, "base64");
const pixels = PNG.sync.read(pngBytes);
if (
  jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)
    ?.data !== expected
)
  throw new Error("synthetic_qr_not_readable");
const noQr = new Uint8ClampedArray(64 * 64 * 4).fill(255);
if (jsQR(noQr, 64, 64) !== null) throw new Error("blank_frame_decoded");
await writeFile(`${out}/ticket-14-public-qr.png`, pngBytes);
const source = `
import {scanPairingQrWithCamera} from '${repo}/apps/android/src/qrCameraScanner';
import jsQR from 'jsqr';
const expected=${JSON.stringify(expected)};
const png=${JSON.stringify(`data:image/png;base64,${pngBytes.toString("base64")}`)};
const events=[];
const mark=(stage,details={})=>{const event={stage,time:Date.now(),...details};events.push(event);console.info('[CLIPP-SCANNER-14]'+JSON.stringify(event));return event};
let ran=false;
window.clippScannerDiagnosis={events,async run(trial){
 if(ran)throw new Error('one_trial_per_document');ran=true;
 mark('trial-start',{trial});
 const Detector=globalThis.BarcodeDetector;
 try{
  if(trial==='feature')return mark('feature-result',{exposed:typeof Detector==='function',probeExposed:typeof Detector?.getSupportedFormats==='function',mediaExposed:typeof navigator.mediaDevices?.getUserMedia==='function'});
  if(trial==='probe'){mark('probe-before');if(!Detector?.getSupportedFormats)return mark('probe-unavailable');const formats=await Detector.getSupportedFormats();return mark('probe-after',{formats});}
  if(trial==='construct'){mark('construct-before');if(!Detector)return mark('provider-absent');new Detector({formats:['qr_code']});return mark('construct-after');}
  if(trial==='detect'){if(!Detector)return mark('provider-absent');mark('construct-before');const detector=new Detector({formats:['qr_code']});mark('construct-after');const canvas=await publicCanvas();mark('detect-before');const codes=await detector.detect(canvas);return mark('detect-after',{decodedExpected:codes.some(code=>code.rawValue===expected),count:codes.length});}
  if(trial==='software'){const canvas=await publicCanvas();const c=canvas.getContext('2d');mark('software-before');const frame=c.getImageData(0,0,canvas.width,canvas.height);const code=jsQR(frame.data,frame.width,frame.height);const blank=jsQR(new Uint8ClampedArray(64*64*4).fill(255),64,64);return mark('software-after',{decodedExpected:code?.data===expected,blankIsNull:blank===null,fixture:'public synthetic pixels; no camera'});}
  if(trial==='scanner-before-media'){
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('media_api_unavailable');
   const media=navigator.mediaDevices;const original=media.getUserMedia;
   media.getUserMedia=()=>{mark('media-sentinel-reached',{fixture:'request intercepted before permission or acquisition'});return Promise.reject(new DOMException('diagnostic sentinel','NotAllowedError'));};
   try{mark('scanner-entry-before');await scanPairingQrWithCamera();return mark('scanner-returned');}catch(error){return mark('scanner-rejected',{message:error.message});}finally{media.getUserMedia=original;}
  }
  throw new Error('unknown_trial');
 }catch(error){return mark('javascript-error',{name:error.name,message:error.message});}
}};
async function publicCanvas(){const image=new Image();image.src=png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas;}
mark('bundle-ready');
`;
await build({
  stdin: { contents: source, resolveDir: repo, loader: "ts" },
  bundle: true,
  format: "iife",
  target: ["chrome91"],
  outfile: `${out}/ticket-14-probes.js`,
});
const paths = [
  "docs/android-scanner-diagnosis.md",
  "tests/harness/android-scanner-diagnosis.mjs",
  "tests/harness/android-scanner-native.mjs",
  "tests/harness/android-scanner-interval.mjs",
  "tests/core/pairing/fixtures/signed-qr-target.json",
  "packages/core/pairing/v2.ts",
  "packages/core/pairing/qrCode.ts",
  "packages/core/pairing/qrTransport.ts",
  "apps/android/src/qrCameraScanner.ts",
  "apps/android/android/app/src/main/AndroidManifest.xml",
  "apps/android/android/app/build.gradle",
  "package-lock.json",
];
const inputHashes = Object.fromEntries(
  await Promise.all(
    paths.map(async (path) => [path, sha256(await readFile(`${repo}/${path}`))])
  )
);
const dirty = execFileSync("git", ["diff", "--binary", "HEAD"], { cwd: repo });
const status = execFileSync("git", ["status", "--short"], {
  cwd: repo,
  encoding: "utf8",
});
const untracked = execFileSync(
  "git",
  ["ls-files", "--others", "--exclude-standard"],
  { cwd: repo, encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .sort();
for (const path of untracked)
  if (!paths.includes(path))
    throw new Error("untracked_source_outside_bounded_fingerprint:" + path);
const untrackedContentHashes = Object.fromEntries(
  untracked.map((path) => [path, inputHashes[path]])
);
const receipt = {
  role: "client",
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim(),
  status,
  trackedDiffSha256: sha256(dirty),
  dirtyStateSha256: sha256(
    JSON.stringify({
      status,
      diff: dirty.toString(),
      untrackedContentHashes,
      inputHashes,
    })
  ),
  untrackedContentHashes,
  inputHashes,
  bundleSha256: sha256(await readFile(`${out}/ticket-14-probes.js`)),
  publicQrSha256: sha256(pngBytes),
  publicTarget: {
    targetPeerId: generated.targetPeerId,
    signedPeerRecordSha256: generated.signedPeerRecordSha256,
    generator: generated.generator,
    acceptedTargetRoundTrip: "passed",
  },
  node: process.version,
  hostDecoder: {
    validPublicPixels: "passed",
    blankPixels: "passed",
    camera: "not-run",
    nativeProvider: "not-run",
  },
  trials: [
    "scanner-before-media",
    "feature",
    "probe",
    "construct",
    "detect",
    "software",
  ],
  limits:
    "Build and host software pixels only. Native/browser/provider/camera trials require a fresh coordinator assignment. Each trial uses a fresh acceptance document. A JavaScript return is not proof of process survival.",
};
await writeFile(
  `${out}/ticket-14-preparation.json`,
  JSON.stringify(receipt, null, 2)
);
console.log(JSON.stringify(receipt.hostDecoder));
