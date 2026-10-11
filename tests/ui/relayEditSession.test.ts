import { createRelayEditSession } from "../../packages/ui/src/relayEditSession";
const relay = {
  key: "a",
  name: "A",
  kind: "managed" as const,
  discoveryUrl: "https://a.example/v1/relay",
};
it("retains relay input and failure across dismissal and reopening, then discards explicitly", async () => {
  const session = createRelayEditSession();
  session.begin(relay);
  session.change("name", "Unsaved relay");
  await session.save(async () => ({
    status: "rejected",
    configurations: [relay],
    configurationApplied: false,
    credentialsRemoved: [],
    error: "disk_full",
  }));
  session.dismiss();
  session.begin({ ...relay, name: "External relay" });
  expect(session.getSnapshot()).toMatchObject({
    active: true,
    raw: { name: "Unsaved relay" },
    error: expect.stringContaining("disk_full"),
  });
  session.discard();
  session.begin(relay);
  expect(session.getSnapshot()?.raw.name).toBe("A");
});
it("a late Save clears submitted fields but preserves newer input for the next explicit Save", async () => {
  const session = createRelayEditSession();
  session.begin(relay);
  session.change("endpoint", "https://saved.example/v1/relay");
  let complete!: (
    value: import("../../packages/core/network/relayMutations").RelayMutationResult
  ) => void;
  const saving = session.save(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  session.change("name", "Newer name");
  const saved = { ...relay, discoveryUrl: "https://saved.example/v1/relay" };
  complete({
    status: "applied",
    configurations: [saved],
    configurationApplied: true,
    credentialsRemoved: [],
  });
  await saving;
  session.reconcile([
    { ...saved, discoveryUrl: "https://external.example/v1/relay" },
  ]);
  let submitted: unknown;
  await session.save(async (mutation) => {
    submitted = mutation;
    return {
      status: "applied",
      configurations: [],
      configurationApplied: true,
      credentialsRemoved: [],
    };
  });
  expect(submitted).toEqual({
    type: "edit",
    key: "a",
    fields: { name: "Newer name" },
  });
});
