/// <reference types="chrome" />
import { installChromeManagement } from "../../apps/extension/src/chromeManagementRuntime";
function runtimeFixture() {
  let receive!: (
    message: any,
    sender: any,
    response: (v: any) => void
  ) => true | void;
  let portReceive!: (port: chrome.runtime.Port) => void;
  const stored: Record<string, unknown> = {};
  let lastError: chrome.runtime.LastError | undefined;
  const api = {
    runtime: {
      id: "extension",
      getURL: (path: string) => `chrome-extension://extension/${path}`,
      get lastError() {
        return lastError;
      },
      onMessage: {
        addListener: (f: typeof receive) => {
          receive = f;
        },
      },
      onConnect: {
        addListener: (f: typeof portReceive) => {
          portReceive = f;
        },
      },
    },
    storage: {
      session: {
        setAccessLevel: (_options: unknown, done: () => void) => done(),
        get: (_key: string, done: (v: any) => void) =>
          done(structuredClone(stored)),
        set: (values: any, done: () => void) => {
          Object.assign(stored, structuredClone(values));
          done();
        },
      },
    },
    tabs: {
      create: (_options: any, done: (tab: any) => void) => {
        lastError = { message: "lost create callback" };
        done(undefined);
        lastError = undefined;
      },
      get: (_id: number, done: (tab: any) => void) =>
        done({ id: 1, url: "chrome-extension://extension/src/options.html" }),
      query: (_query: any, done: (tabs: any[]) => void) => done([]),
    },
  } as unknown as typeof chrome;
  installChromeManagement(api);
  return {
    api,
    stored,
    receive: (message: any, sender: any) =>
      new Promise<any>((resolve) => {
        expect(receive(message, sender, resolve)).toBe(true);
      }),
    portReceive,
  };
}
it("actual Chrome callback listener persists/readbacks acceptance and reports callback uncertainty from canonical tab creation", async () => {
  const f = runtimeFixture();
  const sender = {
    id: "extension",
    url: f.api.runtime.getURL("src/popup.html"),
  };
  expect(
    await f.receive(
      {
        type: "managementNavigate",
        handoff: { id: "sdk", destination: { kind: "requests" } },
      },
      sender
    )
  ).toMatchObject({ ok: true, status: "pending" });
  // Status serializes after the post-response routing operation.
  const status = await f.receive({ type: "managementStatus" }, sender);
  expect(status.records).toEqual([
    expect.objectContaining({
      id: "sdk",
      status: "unconfirmed",
      creating: true,
    }),
  ]);
  expect(
    await f.receive(
      { type: "managementStatus" },
      {
        id: "extension",
        url: f.api.runtime.getURL("src/options.html") + "?requests",
      }
    )
  ).toMatchObject({ ok: false });
});
