/// <reference types="chrome" />
import { spawnSync } from "node:child_process";
const names = [
  "window",
  "document",
  "navigator",
  "chrome",
  "__CLIPP_RELAY_ACCEPTANCE_MEMORY_CLIPBOARD__",
];

async function browserEntry(memory: boolean) {
  const original = new Map(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ])
  );
  const host = { reads: 0, writes: 0, copies: 0, eventReads: 0 };
  const messages: unknown[] = [];
  const listeners = new Map<string, (event: unknown) => Promise<void>>();
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: { stop() {} } },
    navigator: {
      configurable: true,
      value: {
        clipboard: {
          async readText() {
            host.reads++;
            return "SYNTHETIC_OS_CLIPBOARD_CANARY";
          },
          async writeText() {
            host.writes++;
          },
        },
      },
    },
    document: {
      configurable: true,
      value: {
        execCommand() {
          host.copies++;
          return true;
        },
        addEventListener(
          name: string,
          listener: (event: unknown) => Promise<void>
        ) {
          listeners.set(name, listener);
        },
      },
    },
    chrome: {
      configurable: true,
      value: {
        runtime: {
          async sendMessage(message: unknown) {
            messages.push(message);
          },
        },
      },
    },
    __CLIPP_RELAY_ACCEPTANCE_MEMORY_CLIPBOARD__: {
      configurable: true,
      value: memory,
    },
  });
  try {
    jest.isolateModules(() => {
      require("../../apps/extension/src/content");
    });
    const event = {
      clipboardData: {
        getData() {
          host.eventReads++;
          return "SYNTHETIC_EVENT_CLIPBOARD_CANARY";
        },
      },
    };
    await listeners.get("copy")?.(event);
    await listeners.get("cut")?.(event);
    const text = await navigator.clipboard.readText();
    await navigator.clipboard.writeText("synthetic write").catch(() => {});
    const applicationRead = await navigator.clipboard.readText();
    const copied = document.execCommand("copy"),
      cut = document.execCommand("cut"),
      pasted = document.execCommand("paste");
    return { host, messages, text, copied, cut, pasted, applicationRead };
  } catch (error) {
    throw new Error(String(error));
  } finally {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

test("the actual acceptance content entry isolates early clipboard APIs and copy-event payloads before CDP", async () => {
  const observed = await browserEntry(true);
  expect(observed).toEqual({
    host: { reads: 0, writes: 0, copies: 0, eventReads: 0 },
    messages: [],
    text: "",
    applicationRead: "synthetic write",
    copied: false,
    cut: false,
    pasted: false,
  });
});

test("the real content entry keeps native clipboard and capture behavior when memory isolation is off", async () => {
  const observed = await browserEntry(false);
  expect(observed).toEqual({
    host: { reads: 2, writes: 1, copies: 3, eventReads: 2 },
    messages: [
      { type: "clipboardUpdate", text: "SYNTHETIC_EVENT_CLIPBOARD_CANARY" },
      { type: "clipboardUpdate", text: "SYNTHETIC_EVENT_CLIPBOARD_CANARY" },
    ],
    text: "SYNTHETIC_OS_CLIPBOARD_CANARY",
    applicationRead: "SYNTHETIC_OS_CLIPBOARD_CANARY",
    copied: true,
    cut: true,
    pasted: true,
  });
});

function resolveBuild(mode: string, memory: string) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {resolveConfig} from 'vite';const config=await resolveConfig({configFile:'apps/extension/vite.config.ts',mode:${JSON.stringify(mode)},logLevel:'silent'},'build');console.log(JSON.stringify(config.define));`,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CLIPP_RELAY_ACCEPTANCE_TRANSPORT:
          mode === "relay-acceptance" ? "wss" : "",
        CLIPP_RELAY_ACCEPTANCE_MEMORY_CLIPBOARD: memory,
      },
    }
  );
}

test("the public build configuration defaults both ordinary and transport-only builds to native clipboard", () => {
  for (const mode of ["production", "relay-acceptance"]) {
    const built = resolveBuild(mode, "");
    expect(built.status).toBe(0);
    expect(
      JSON.parse(built.stdout).__CLIPP_RELAY_ACCEPTANCE_MEMORY_CLIPBOARD__
    ).toBe("false");
  }
});

test("the public build configuration accepts memory isolation only through an explicit acceptance build flag", () => {
  const ordinary = resolveBuild("production", "1");
  expect(ordinary.status).not.toBe(0);
  expect(ordinary.stderr).toContain(
    "acceptance_memory_clipboard_requires_test_build"
  );
  const acceptance = resolveBuild("relay-acceptance", "1");
  expect(acceptance.status).toBe(0);
  expect(
    JSON.parse(acceptance.stdout).__CLIPP_RELAY_ACCEPTANCE_MEMORY_CLIPBOARD__
  ).toBe("true");
});
