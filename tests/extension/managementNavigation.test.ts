import { createUiSession } from "../../packages/ui/src/uiSession";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  navigateManagement,
  ManagementNavigationView,
} from "../../apps/extension/src/ManagementNavigation";
import { createManagementNavigationConsumer } from "../../apps/extension/src/managementNavigationConsumer";

type Runtime = Pick<typeof chrome.runtime, "sendMessage" | "lastError">;
function runtimeFixture() {
  const requests: { message: any; reply(response: any): void }[] = [];
  const runtime = {
    lastError: undefined,
    sendMessage(message: any, reply: (response: any) => void) {
      requests.push({ message, reply });
    },
  } as Runtime;
  return { runtime: runtime as typeof chrome.runtime, requests };
}
it("a known suspended-identity rejection explains recovery without claiming uncertain acceptance", () => {
  const fixture = runtimeFixture();
  const consumer = createManagementNavigationConsumer(
    fixture.runtime,
    createUiSession()
  );
  const stop = consumer.start();
  fixture.requests[0].reply({ ok: true, records: [] });
  try {
    consumer.open();
    fixture.requests[1].reply({
      ok: false,
      error: "identity_runtime_suspended",
    });
    expect(consumer.getSnapshot()).toMatchObject({
      records: [],
      openUnconfirmed: false,
      pending: false,
      error:
        "Clipp is not ready to navigate. Check its recovery status before trying again.",
    });
  } finally {
    stop();
  }
});
it.each([undefined, null, {}])(
  "an unusable successful status payload (%p) retains notices and reports uncertainty",
  (records) => {
    const fixture = runtimeFixture();
    const consumer = createManagementNavigationConsumer(
      fixture.runtime,
      createUiSession()
    );
    const stop = consumer.start();
    const retained = [
      { id: "retained", status: "failed", error: "Check navigation" },
    ];
    fixture.requests[0].reply({ ok: true, records: retained });
    try {
      consumer.refresh();
      fixture.requests[1].reply({ ok: true, records });
      expect(consumer.getSnapshot()).toMatchObject({
        statusError: true,
        records: retained,
      });
    } finally {
      stop();
    }
  }
);
it("a read begun before Dismiss cannot restore its notice or status error after a newer mailbox result", () => {
  const fixture = runtimeFixture();
  const consumer = createManagementNavigationConsumer(
    fixture.runtime,
    createUiSession()
  );
  const stop = consumer.start();
  const records = [
    { id: "original", status: "failed", error: "Check navigation" },
  ];
  fixture.requests[0].reply({ ok: true, records });
  try {
    consumer.refresh();
    consumer.act("managementDismiss", "original");
    fixture.requests[2].reply({ ok: true });
    fixture.requests[3].reply({ ok: true, records: [] });
    fixture.requests[1].reply({ ok: true, records });
    fixture.requests[1].reply({ ok: false });
    expect(consumer.getSnapshot()).toMatchObject({
      records: [],
      statusError: false,
      error: null,
      pending: false,
    });
  } finally {
    stop();
  }
});
it.each(["managementRetry", "managementDismiss", "managementNavigate"])(
  "a stopped identity lifetime ignores its late %s result without affecting the new consumer",
  (type) => {
    jest.useFakeTimers();
    const fixture = runtimeFixture();
    const session = createUiSession();
    session.update({ search: "retained session" });
    const old = createManagementNavigationConsumer(fixture.runtime, session);
    const stop = old.start();
    fixture.requests[0].reply({ ok: true, records: [] });
    if (type === "managementNavigate") old.open();
    else old.act(type as "managementRetry" | "managementDismiss", "original");
    stop();
    const stopped = old.getSnapshot();
    const current = createManagementNavigationConsumer(
      fixture.runtime,
      session
    );
    const stopCurrent = current.start();
    try {
      fixture.requests[2].reply({ ok: true, records: [] });
      fixture.requests[1].reply({ ok: false });
      expect(old.getSnapshot()).toBe(stopped);
      expect(current.getSnapshot()).toMatchObject({
        records: [],
        error: null,
        pending: false,
      });
      expect(session.getSnapshot().search).toBe("retained session");
      expect(fixture.requests).toHaveLength(3);
      stopCurrent();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      stopCurrent();
      jest.useRealTimers();
    }
  }
);
it("the real navigation view retains an uncertain Open notice and retries its original handoff without replaying a new Open", async () => {
  jest.useFakeTimers();
  const fixture = runtimeFixture();
  const session = createUiSession();
  session.update({ search: "retained query", filterMode: "pinned" });
  const consumer = createManagementNavigationConsumer(fixture.runtime, session);
  const stop = consumer.start();
  const render = () =>
    renderToStaticMarkup(
      React.createElement(ManagementNavigationView, {
        consumer,
        surface: "popup",
      })
    );
  fixture.requests[0].reply({ ok: true, records: [] });
  try {
    consumer.open();
    const handoff = fixture.requests[1].message.handoff;
    expect(handoff.destination).toMatchObject({
      kind: "history",
      context: { search: "retained query", filterMode: "pinned" },
    });
    expect(render()).toContain('disabled=""');
    await jest.advanceTimersByTimeAsync(15000);
    fixture.requests.at(-1)?.reply({ ok: true, records: [] });
    expect(consumer.getSnapshot().records).toContainEqual(
      expect.objectContaining({ id: handoff.id, status: "unconfirmed" })
    );
    expect(render()).toContain("Retry navigation");
    consumer.open();
    consumer.act("managementRetry", handoff.id);
    expect(fixture.requests.at(-1)?.message).toEqual({
      type: "managementRetry",
      id: handoff.id,
    });
    expect(
      fixture.requests.filter((r) => r.message.type === "managementNavigate")
    ).toHaveLength(1);
    expect(render()).toContain('disabled="">Retry navigation');
    expect(
      renderToStaticMarkup(
        React.createElement(ManagementNavigationView, {
          consumer,
          surface: "page",
        })
      )
    ).not.toContain("Open full-page Clipp");
  } finally {
    stop();
    jest.useRealTimers();
  }
});
it.each(["status", "dismiss"])(
  "uncertain Open is released by confirmed %s before another explicit Open",
  async (route) => {
    jest.useFakeTimers();
    const fixture = runtimeFixture();
    const consumer = createManagementNavigationConsumer(
      fixture.runtime,
      createUiSession()
    );
    const stop = consumer.start();
    fixture.requests[0].reply({ ok: true, records: [] });
    try {
      consumer.open();
      const handoff = fixture.requests[1].message.handoff;
      await jest.advanceTimersByTimeAsync(15000);
      if (route === "dismiss") {
        consumer.act("managementDismiss", handoff.id);
        fixture.requests.at(-1)?.reply({ ok: true });
      }
      fixture.requests.at(-1)?.reply({
        ok: true,
        records: route === "status" ? [{ ...handoff, status: "applied" }] : [],
      });
      expect(consumer.getSnapshot().openUnconfirmed).toBe(false);
      expect(consumer.getSnapshot().error).toBeNull();
      expect(
        fixture.requests.filter((r) => r.message.type === "managementNavigate")
      ).toHaveLength(1);
      consumer.open();
      expect(fixture.requests.at(-1)?.message.handoff.id).not.toBe(handoff.id);
    } finally {
      stop();
      jest.useRealTimers();
    }
  }
);
it("a synchronous recovery failure leaves an honest notice and releases the action", () => {
  const fixture = runtimeFixture();
  const consumer = createManagementNavigationConsumer(
    fixture.runtime,
    createUiSession()
  );
  const stop = consumer.start();
  fixture.requests[0].reply({ ok: true, records: [] });
  fixture.runtime.sendMessage = (() => {
    throw new Error("Context invalidated");
  }) as typeof chrome.runtime.sendMessage;
  try {
    expect(() => consumer.act("managementRetry", "original")).not.toThrow();
    expect(consumer.getSnapshot()).toMatchObject({
      pending: false,
      error: expect.stringContaining("could not be confirmed"),
    });
  } finally {
    stop();
  }
});
it("recovery keeps one unresolved action, times out, and retries only the original handoff ID", async () => {
  jest.useFakeTimers();
  const fixture = runtimeFixture();
  const consumer = createManagementNavigationConsumer(
    fixture.runtime,
    createUiSession()
  );
  const stop = consumer.start();
  fixture.requests[0].reply({ ok: true, records: [] });
  try {
    consumer.act("managementRetry", "original");
    consumer.act("managementRetry", "original");
    consumer.act("managementDismiss", "other");
    expect(consumer.getSnapshot().pending).toBe(true);
    expect(fixture.requests.map((r) => r.message)).toEqual([
      { type: "managementStatus" },
      { type: "managementRetry", id: "original" },
    ]);
    await jest.advanceTimersByTimeAsync(15000);
    expect(consumer.getSnapshot()).toMatchObject({
      pending: false,
      error: expect.stringContaining("could not be confirmed"),
    });
    const timedOut = consumer.getSnapshot();
    fixture.requests[1].reply({ ok: false });
    expect(consumer.getSnapshot()).toBe(timedOut);
    consumer.act("managementRetry", "original");
    expect(fixture.requests.at(-1)?.message).toEqual({
      type: "managementRetry",
      id: "original",
    });
  } finally {
    stop();
    jest.useRealTimers();
  }
});
it("a missing status callback reaches an uncertainty notice and an expired read cannot replace a newer result", async () => {
  jest.useFakeTimers();
  const fixture = runtimeFixture();
  const consumer = createManagementNavigationConsumer(
    fixture.runtime,
    createUiSession()
  );
  const stop = consumer.start();
  try {
    await jest.advanceTimersByTimeAsync(15000);
    expect(consumer.getSnapshot().statusError).toBe(true);
    expect(fixture.requests).toHaveLength(1);
    consumer.refresh();
    fixture.requests[1].reply({ ok: true, records: [] });
    fixture.requests[0].reply({ ok: true, records: [{ id: "expired" }] });
    expect(consumer.getSnapshot()).toMatchObject({
      statusError: false,
      records: [],
    });
  } finally {
    stop();
    jest.useRealTimers();
  }
});
it("a stopped document ignores old status replies and cancels its timers before a new lifetime starts", () => {
  jest.useFakeTimers();
  const fixture = runtimeFixture();
  const consumer = createManagementNavigationConsumer(
    fixture.runtime,
    createUiSession()
  );
  const stop = consumer.start();
  stop();
  try {
    const stopped = consumer.getSnapshot();
    fixture.requests[0].reply({ ok: false });
    expect(consumer.getSnapshot()).toBe(stopped);
    expect(jest.getTimerCount()).toBe(0);
    const stopNext = consumer.start();
    fixture.requests[1].reply({ ok: true, records: [] });
    fixture.requests[0].reply({ ok: true, records: [{ id: "old-document" }] });
    expect(consumer.getSnapshot().records).toEqual([]);
    stopNext();
  } finally {
    stop();
    jest.useRealTimers();
  }
});
it("a synchronous status transport failure leaves a recoverable status notice", () => {
  const runtime = {
    lastError: undefined,
    sendMessage() {
      throw new Error("Extension context invalidated.");
    },
  } as Runtime;
  const consumer = createManagementNavigationConsumer(
    runtime as typeof chrome.runtime,
    createUiSession()
  );
  let stop: (() => void) | undefined;
  try {
    expect(() => {
      stop = consumer.start();
    }).not.toThrow();
    expect(consumer.getSnapshot().statusError).toBe(true);
  } finally {
    stop?.();
  }
});
it("a synchronous Chrome transport failure reports unconfirmed navigation acceptance", async () => {
  const runtime = {
    lastError: undefined,
    sendMessage() {
      throw new Error("Extension context invalidated.");
    },
  } as Runtime;
  await expect(
    navigateManagement(runtime as typeof chrome.runtime, "handoff", {
      kind: "history",
    })
  ).resolves.toMatchObject({
    ok: false,
    error: expect.stringContaining("could not be confirmed"),
  });
});
it("a missing callback is bounded and a late accepted reply cannot replace its unconfirmed result", async () => {
  jest.useFakeTimers();
  try {
    let reply!: (response: unknown) => void;
    const runtime = {
      lastError: undefined,
      sendMessage(_message: unknown, callback: typeof reply) {
        reply = callback;
      },
    } as Runtime;
    const result = navigateManagement(
      runtime as typeof chrome.runtime,
      "handoff",
      { kind: "requests" }
    );
    await jest.advanceTimersByTimeAsync(15000);
    await expect(result).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("could not be confirmed"),
    });
    reply({ ok: true, status: "pending" });
    await expect(result).resolves.toMatchObject({ ok: false });
  } finally {
    jest.useRealTimers();
  }
});
