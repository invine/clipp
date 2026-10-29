import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Execute the registered public message handlers and their real forwarding code.
// Chrome messaging and the already-started libp2p transport are the boundaries;
// no forwarding helper or authorization/generation implementation is replaced.
function source(file: string) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(path.resolve(file), "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
}
function functions(file: string, names: string[]) {
  return source(file)
    .statements.filter(
      (node) =>
        ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? "")
    )
    .map((node) => node.getText().replace(/^export /, ""))
    .join("\n");
}
function listener(file: string, marker: string) {
  const node = source(file).statements.find(
    (node) =>
      ts.isExpressionStatement(node) &&
      node.getText().startsWith("chrome.runtime.onMessage.addListener(") &&
      node.getText().includes(marker)
  );
  if (!node) throw new Error(`public listener missing: ${file}`);
  return node.getText();
}
function execute(code: string, context: vm.Context) {
  vm.runInContext(
    ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText,
    context
  );
}
function connectedRuntime(compiled = true) {
  const id = "a".repeat(32),
    backgroundUrl = `chrome-extension://${id}/service-worker-loader.js`;
  const backgroundFile = "apps/extension/src/background.ts";
  const offscreenFile = "apps/extension/src/offscreen.ts";
  const generationFenced = fs
    .readFileSync(offscreenFile, "utf8")
    .includes('error: "identity_runtime_retired"');
  let background: (...args: any[]) => unknown = () => {},
    offscreen: (...args: any[]) => unknown = () => {};
  const base = { Promise, Set, Map, setTimeout, Error };
  const worker = vm.createContext({
    ...base,
    chrome: {
      runtime: {
        id,
        onMessage: {
          addListener: (fn: typeof background) => {
            background = fn;
          },
        },
        sendMessage: (message: unknown, respond: (value: unknown) => void) =>
          offscreen(message, { id, url: backgroundUrl }, respond),
      },
    },
  });
  execute(
    `let offscreenInitialized = true, offscreenOwned = true, offscreenCreateFlight = null, offscreenInitFlight = null;
const startupResetChecked = true, startupResetReady = Promise.resolve(), offscreenReady = Promise.resolve();
const clipboardSync = { isAutoSync: () => true };`,
    worker
  );
  if (generationFenced) {
    execute(
      functions("packages/core/runtime/identityInitialization.ts", [
        "createIdentityBoundWorkFence",
      ]),
      worker
    );
    execute(
      'const uuidv4 = () => "synthetic-generation"; const identityWork = createIdentityBoundWorkFence();',
      worker
    );
  }
  execute(
    functions(backgroundFile, [
      "ensureOffscreenDocument",
      "initializeOffscreen",
      "sendOffscreen",
    ]) + listener(backgroundFile, 'msg.type === "getStatus"'),
    worker
  );
  const document = vm.createContext({
    ...base,
    chrome: {
      runtime: {
        id,
        getURL: (value: string) => `chrome-extension://${id}/${value}`,
        onMessage: {
          addListener: (fn: typeof offscreen) => {
            offscreen = fn;
          },
        },
      },
    },
    window: { __clippAcceptanceEarlyMemoryClipboard: compiled },
  });
  execute(
    `const BACKGROUND_URL = ${JSON.stringify(backgroundUrl)}; let runtimeGeneration;
const started = true, acceptanceMemory = ${compiled}, acceptanceTransport = ${compiled ? '"wss"' : "undefined"};
const transport = {getConnectedPeers: () => ["synthetic-peer"], getPeerConnectionInfo: () => [{privateCanary: "SYNTHETIC_STATUS_PRIVATE_CANARY"}]};`,
    document
  );
  execute(
    functions("apps/extension/src/managedRelayControl.ts", [
      "authorizedBackgroundControl",
      "isManagedRelayControlAction",
    ]) +
      functions("apps/extension/src/clipboardBridge.ts", [
        "isExtensionClipboardRequest",
      ]) +
      functions("apps/extension/src/networkBridge.ts", [
        "isExtensionReachabilityRequest",
      ]) +
      listener(offscreenFile, 'msg?.target !== "offscreen"'),
    document
  );
  const request = (handler: typeof background, message: unknown, url: string) =>
    new Promise<any>((resolve) => handler(message, { id, url }, resolve));
  return {
    generationFenced,
    status: () =>
      request(
        background,
        { type: "getStatus" },
        `chrome-extension://${id}/src/options.html`
      ),
    direct: (runtimeGeneration?: string) =>
      request(
        offscreen,
        {
          target: "offscreen",
          action: "getStatus",
          ...(runtimeGeneration ? { runtimeGeneration } : {}),
        },
        `chrome-extension://${id}/src/options.html`
      ),
    missingGeneration: () =>
      request(
        offscreen,
        { target: "offscreen", action: "getStatus" },
        backgroundUrl
      ),
    stale: () =>
      request(
        offscreen,
        {
          target: "offscreen",
          action: "getStatus",
          runtimeGeneration: "retired-generation",
        },
        backgroundUrl
      ),
  };
}

test("options reads actual offscreen acceptance flags through the background-owned status query", async () => {
  const runtime = connectedRuntime();
  expect(await runtime.status()).toEqual({
    peerCount: 1,
    autoSync: true,
    started: true,
    acceptanceMemoryClipboard: true,
    relayAcceptanceTransport: "wss",
  });
  if (runtime.generationFenced) {
    expect(await runtime.direct()).toEqual({
      ok: false,
      error: "offscreen_control_unauthorized",
    });
    expect(await runtime.missingGeneration()).toEqual({
      ok: false,
      error: "identity_runtime_retired",
    });
    expect(await runtime.stale()).toEqual({
      ok: false,
      error: "identity_runtime_retired",
    });
  }
});

test("ordinary offscreen builds cannot acquire acceptance proof from the status bridge", async () => {
  expect(await connectedRuntime(false).status()).toEqual({
    peerCount: 1,
    autoSync: true,
    started: true,
  });
});
