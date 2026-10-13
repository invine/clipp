import { createPopupCapture } from "../../apps/extension/src/popupCapture";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

it("reports focused clipboard read failure once and recovers through deliberate ordinary Retry", async () => {
  let focused = true;
  const events = new EventTarget();
  let readable = false;
  const observations: unknown[] = [];
  const states: unknown[] = [];
  const capture = createPopupCapture({
    hasFocus: () => focused,
    subscribeFocus: (listener) => {
      events.addEventListener("focus", listener);
      return () => events.removeEventListener("focus", listener);
    },
    readText: async () => {
      if (!readable) throw Error("permission denied");
      return "new text";
    },
    runtime: {
      sendMessage: (message, reply) => {
        observations.push(message);
        reply({ ok: true });
      },
    },
    onState: (state) => states.push(state),
  });
  capture.start();
  await settle();
  expect(states.at(-1)).toEqual({ pending: false, error: "read_failed" });
  events.dispatchEvent(new Event("focus"));
  events.dispatchEvent(new Event("focus"));
  await settle();
  expect(states).toHaveLength(2);
  focused = false;
  readable = true;
  expect(await capture.retry()).toBe(false);
  expect(observations).toEqual([]);
  focused = true;
  expect(await capture.retry()).toBe(true);
  expect(observations).toEqual([{ type: "clipboardUpdate", text: "new text" }]);
  expect(states.at(-1)).toEqual({ pending: false, error: null });
  capture.dispose();
});

it("keeps lost handoff uncertainty recoverable and ignores the old reply after a confirmed Retry", async () => {
  jest.useFakeTimers();
  let firstReply!: (response?: unknown) => void;
  let handoffs = 0;
  const states: unknown[] = [];
  const capture = createPopupCapture({
    hasFocus: () => true,
    subscribeFocus: () => () => {},
    readText: async () => "same text",
    runtime: {
      sendMessage: (_, reply) => {
        handoffs++;
        if (handoffs === 1) firstReply = reply;
        else reply({ ok: true });
      },
    },
    onState: (state) => states.push(state),
  });
  capture.start();
  await jest.advanceTimersByTimeAsync(10_000);
  expect(states.at(-1)).toEqual({
    pending: false,
    error: "handoff_unconfirmed",
  });
  expect(await capture.retry()).toBe(true);
  firstReply({ ok: false });
  expect(states.at(-1)).toEqual({ pending: false, error: null });
  capture.dispose();
  jest.useRealTimers();
});

it.each([
  [undefined, undefined, "handoff_unconfirmed"],
  [{ ok: true }, { message: "worker stopped" }, "handoff_unconfirmed"],
  [{ ok: false, error: "capture failed" }, undefined, "handoff_failed"],
])(
  "reports response %j and transport error %j truthfully",
  async (response, lastError, error) => {
    const states: unknown[] = [];
    let accepted = false;
    const capture = createPopupCapture({
      hasFocus: () => true,
      subscribeFocus: () => () => {},
      readText: async () => "current",
      runtime: {
        get lastError() {
          return accepted ? undefined : lastError;
        },
        sendMessage: (_, reply) => reply(accepted ? { ok: true } : response),
      },
      onState: (state) => states.push(state),
    });
    expect(await capture.retry()).toBe(false);
    expect(states.at(-1)).toEqual({ pending: false, error });
    accepted = true;
    expect(await capture.retry()).toBe(true);
    expect(states.at(-1)).toEqual({ pending: false, error: null });
    capture.dispose();
  }
);

it("does not send a late read after popup destruction or publish a late handoff acknowledgement", async () => {
  let finishRead!: (text: string) => void;
  const observations: unknown[] = [];
  const states: unknown[] = [];
  let finishReply!: (response?: unknown) => void;
  const options = {
    hasFocus: () => true,
    subscribeFocus: () => () => {},
    readText: () =>
      new Promise<string>((resolve) => {
        finishRead = resolve;
      }),
    runtime: {
      sendMessage: (message: object, reply: (response?: unknown) => void) => {
        observations.push(message);
        finishReply = reply;
      },
    },
    onState: (state: unknown) => states.push(state),
  };
  const capture = createPopupCapture(options);
  const read = capture.retry();
  capture.dispose();
  finishRead("destroyed popup text");
  expect(await read).toBe(false);
  expect(observations).toEqual([]);
  expect(states).toEqual([{ pending: true, error: null }]);

  const next = createPopupCapture({
    ...options,
    readText: async () => "next text",
  });
  const handoff = next.retry();
  await settle();
  next.dispose();
  finishReply({ ok: true });
  expect(await handoff).toBe(false);
  expect(states).toEqual([
    { pending: true, error: null },
    { pending: true, error: null },
  ]);
});

it("ordinary focus and Retry preserve new, empty, unchanged and remote-baseline Clip semantics", async () => {
  const { createRuntimeClipboardService } =
    await import("../../packages/core/runtime/clipboard");
  const { RUNTIME_CAPABILITIES } =
    await import("../../packages/core/runtime/capabilities");
  const { MemoryHistoryStore } =
    await import("../../packages/core/history/store");
  const { InMemoryHistoryBackend } =
    await import("../../packages/core/history/types");
  const { observeExtensionClipboard } =
    await import("../../apps/extension/src/clipboardObservation");
  const originPeerId = "12D3KooWJ5oQ9G9kDMwrrzmVWwZnJryHJns8ovH8LYgDgJYJYyXy";
  const history = new MemoryHistoryStore(new InMemoryHistoryBackend());
  let text = "first";
  const clipboard = createRuntimeClipboardService({
    capabilities: RUNTIME_CAPABILITIES.chromeExtension,
    getSenderId: () => originPeerId,
    history,
    writeText: async (value) => {
      text = value;
    },
  });
  const { createClipboardSyncManager } =
    await import("../../packages/core/sync/clipboardSync");
  const { createLiveClipGossip } =
    await import("../../packages/core/sync/liveClipGossip");
  const sent: Uint8Array[] = [];
  const liveGossip = createLiveClipGossip({
    transport: {
      send: async (_, __, frame) => {
        sent.push(frame);
      },
      onMessage: () => {},
      onPeerConnected: () => {},
      getConnectedPeers: () => ["trusted-device"],
    },
    membershipStatus: async () => "active",
  });
  const sync = createClipboardSyncManager({
    clipboard,
    history,
    liveGossip,
    autoSync: false,
    getLocalDeviceId: async () => originPeerId,
  });
  sync.start();
  const events = new EventTarget();
  const states: unknown[] = [];
  const seen: string[] = [];
  let rejectNext = true;
  const capture = createPopupCapture({
    hasFocus: () => true,
    subscribeFocus: (listener) => {
      events.addEventListener("focus", listener);
      return () => events.removeEventListener("focus", listener);
    },
    readText: async () => text,
    runtime: {
      sendMessage: (message, reply) => {
        const value = (message as { text: string }).text;
        seen.push(value);
        if (rejectNext) {
          rejectNext = false;
          reply({ ok: false });
          return;
        }
        void observeExtensionClipboard(
          value,
          clipboard,
          Promise.resolve()
        ).then(reply);
      },
    },
    onState: (state) => states.push(state),
  });
  capture.start();
  await settle();
  expect((await history.snapshot()).clips).toEqual([]);
  expect(await capture.retry()).toBe(true);
  const first = (await history.snapshot()).clips[0];
  expect(first.content).toBe("first");
  expect(await capture.retry()).toBe(true);
  expect((await history.snapshot()).clips.map((item) => item.id)).toEqual([
    first.id,
  ]);
  events.dispatchEvent(new Event("focus"));
  await settle();
  expect(seen).toEqual(["first", "first", "first"]);

  text = "";
  events.dispatchEvent(new Event("focus"));
  await settle();
  expect(states.at(-1)).toEqual({ pending: false, error: null });
  text = "first";
  events.dispatchEvent(new Event("focus"));
  await settle();
  const recaptured = (await history.snapshot()).clips;
  expect(recaptured).toHaveLength(2);
  expect(new Set(recaptured.map((item) => item.id)).size).toBe(2);

  const remote = {
    ...first,
    id: "00000000-0000-4000-8000-000000000999",
    content: "remote baseline",
  };
  await clipboard.writeRemoteClip(remote);
  const baselineCaptureCount = (await history.snapshot()).clips.length;
  expect(await capture.retry()).toBe(true);
  expect(await capture.retry()).toBe(true);
  expect((await history.snapshot()).clips).toHaveLength(baselineCaptureCount);
  expect(states.at(-1)).toEqual({ pending: false, error: null });
  await settle();
  expect(sent).toEqual([]);
  sync.setAutoSync(true);
  text = "new while Auto Sync enabled";
  expect(await capture.retry()).toBe(true);
  await settle();
  expect(sent).toHaveLength(1);
  capture.dispose();
  await sync.stop();
});
