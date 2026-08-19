import { createRuntimeNetworkProxy } from "../../../packages/core/runtime/network";
import { createObservedRuntimeTransport } from "./observedTransport";

describe("replaceable runtime network", () => {
  it("binds each protocol handler once to the initial and replacement transports", () => {
    const initial = createObservedRuntimeTransport();
    const replacement = createObservedRuntimeTransport();
    let current = initial.transport;
    const network = createRuntimeNetworkProxy(() => current);
    const received: string[] = [];

    network.onMessage("/clipp/pairing/1.0.0", (from) => received.push(from));
    network.bindCurrent();
    initial.receive("/clipp/pairing/1.0.0", "initial-peer", new Uint8Array());

    current = replacement.transport;
    network.bindCurrent();
    network.bindCurrent();
    replacement.receive("/clipp/pairing/1.0.0", "replacement-peer", new Uint8Array());

    expect(initial.handlerCount("/clipp/pairing/1.0.0")).toBe(1);
    expect(replacement.handlerCount("/clipp/pairing/1.0.0")).toBe(1);
    expect(received).toEqual(["initial-peer", "replacement-peer"]);
  });

  it("forwards disconnect to the current transport", async () => {
    const observed = createObservedRuntimeTransport();
    const network = createRuntimeNetworkProxy(() => observed.transport);

    await network.disconnect?.("peer-a");

    expect(observed.disconnectedPeers).toEqual(["peer-a"]);
  });

  it("binds each stream handler once to replacement streaming transports", async () => {
    const initial = createObservedRuntimeTransport();
    const replacement = createObservedRuntimeTransport();
    let current = initial.transport;
    const network = createRuntimeNetworkProxy(() => current);
    const received: string[] = [];

    network.onStream("/clipp/history/1.0.0", async (from) => { received.push(from); });
    expect(() => network.onStream("/clipp/history/1.0.0", async () => {}))
      .toThrow("protocol_handler_already_registered");
    current = replacement.transport;
    network.bindCurrent();
    network.bindCurrent();
    await replacement.receiveStream("/clipp/history/1.0.0", "replacement-peer", (async function *() {})());

    expect(initial.streamHandlerCount("/clipp/history/1.0.0")).toBe(1);
    expect(replacement.streamHandlerCount("/clipp/history/1.0.0")).toBe(1);
    expect(received).toEqual(["replacement-peer"]);
  });
});
