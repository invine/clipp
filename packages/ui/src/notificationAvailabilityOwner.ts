import type { RuntimeNotificationAvailability } from "../../core/runtime/notifications";

/** Owns notification reads and actions for the currently started workspace. */
export function createNotificationAvailabilityOwner(options: {
  read(): Promise<RuntimeNotificationAvailability>;
  setState(state: RuntimeNotificationAvailability): void;
  setPending(pending: boolean): void;
  setError(error: boolean): void;
  publish(): void;
}) {
  let active = false;
  let generation = 0;
  let refreshGeneration = 0;
  let errorRevision = 0;
  let acting = false;

  const owns = (expected: number) => active && generation === expected;

  function start() {
    if (active) return;
    active = true;
    generation += 1;
    refreshGeneration = 0;
    acting = false;
    options.setPending(false);
    options.publish();
  }

  function stop() {
    if (!active) return;
    active = false;
    generation += 1;
    acting = false;
    options.setPending(false);
  }

  async function refresh() {
    if (!active) return;
    const expected = generation;
    const request = ++refreshGeneration;
    const observedErrorRevision = errorRevision;
    try {
      const state = await options.read();
      if (!owns(expected) || request !== refreshGeneration) return;
      options.setState(state);
      if (observedErrorRevision === errorRevision) options.setError(false);
    } catch {
      if (!owns(expected) || request !== refreshGeneration) return;
      options.setError(true);
      errorRevision += 1;
    }
    options.publish();
  }

  async function run(action: () => Promise<unknown>) {
    if (!active || acting) return;
    acting = true;
    const expected = generation;
    options.setPending(true);
    options.setError(false);
    errorRevision += 1;
    options.publish();
    try {
      await action();
      if (owns(expected)) await refresh();
    } catch {
      if (owns(expected)) {
        options.setError(true);
        errorRevision += 1;
      }
    } finally {
      if (owns(expected)) {
        acting = false;
        options.setPending(false);
        options.publish();
      }
    }
  }

  return { start, stop, refresh, run };
}
