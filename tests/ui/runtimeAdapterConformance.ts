import type {
  UiRuntimeAdapter,
  UiRuntimeSnapshot,
} from "../../packages/ui/src/runtimeAdapter";

export type UiRuntimeSnapshotConformanceHarness = {
  adapter: UiRuntimeAdapter;
  afterStart?(): Promise<void>;
  publishObservation(): Promise<void>;
};

/** Shared public-interface case for stable reads and coherent publication. */
export async function verifyUiRuntimeSnapshotConformance(
  harness: UiRuntimeSnapshotConformanceHarness
): Promise<{ previous: UiRuntimeSnapshot; current: UiRuntimeSnapshot }> {
  const { adapter } = harness;
  await adapter.start?.();
  await harness.afterStart?.();

  const previous = adapter.getSnapshot();
  if (adapter.getSnapshot() !== previous)
    throw new Error("snapshot_identity_changed_without_publication");

  let observedDuringNotification: UiRuntimeSnapshot | undefined;
  const unsubscribe = adapter.subscribe(() => {
    observedDuringNotification = adapter.getSnapshot();
  });
  await harness.publishObservation();
  const current = adapter.getSnapshot();
  unsubscribe();

  if (current === previous)
    throw new Error("snapshot_identity_not_changed_on_publication");
  if (observedDuringNotification !== current)
    throw new Error("subscriber_did_not_observe_published_snapshot");
  if (adapter.getSnapshot() !== current)
    throw new Error("snapshot_identity_changed_after_publication");

  return { previous, current };
}
