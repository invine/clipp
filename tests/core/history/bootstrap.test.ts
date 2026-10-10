import { createHistoryInitialLoadGate } from "../../../packages/core/history/bootstrap";

describe("History initial load gate", () => {
  it("does not let a delayed bootstrap rejection replace a live update", () => {
    const states: string[] = [];
    const loading: boolean[] = [];
    const failed: boolean[] = [];
    const gate = createHistoryInitialLoadGate({
      onState: (state: string) => states.push(state),
      onLoading: (value) => loading.push(value),
      onFailed: (value) => failed.push(value),
    });

    gate.live("newer");
    expect(gate.rejected()).toBe(false);
    gate.resolved("stale");
    expect(states).toEqual(["newer"]);
    expect(loading).toEqual([false]);
    expect(failed).toEqual([false]);
  });

  it("shows an initial failure until a later live update recovers it", () => {
    const states: string[] = [];
    const failed: boolean[] = [];
    const gate = createHistoryInitialLoadGate({
      onState: (state: string) => states.push(state),
      onLoading: () => undefined,
      onFailed: (value) => failed.push(value),
    });
    expect(gate.rejected()).toBe(true);
    gate.live("recovered");
    gate.cancel();
    gate.live("after unmount");
    expect(states).toEqual(["recovered"]);
    expect(failed).toEqual([true, false]);
  });
});
