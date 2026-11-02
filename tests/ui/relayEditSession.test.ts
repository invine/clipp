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
it("changing Type leaves an untouched Name to the authoritative owner", async () => {
  const session = createRelayEditSession();
  session.begin(relay);
  session.change("kind", "explicit");
  session.change("peerId", "peer-b");
  session.change("endpoint", "/dns4/relay.example/tcp/1234/p2p/peer-b");
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
    fields: {
      kind: "explicit",
      peerId: "peer-b",
      addresses: ["/dns4/relay.example/tcp/1234/p2p/peer-b"],
    },
  });
});
it("a partially committed Add becomes an Edit of the same applied entity", async () => {
  const session = createRelayEditSession();
  session.begin();
  session.change("name", "Created relay");
  session.change("endpoint", "https://created.example/v1/relay");
  let created: typeof relay | undefined;
  await session.save(async (mutation) => {
    if (mutation.type !== "add" || mutation.configuration.kind !== "managed")
      throw new Error("expected_add");
    created = mutation.configuration;
    return {
      status: "partial",
      configurations: [created],
      configurationApplied: true,
      credentialsRemoved: [],
      error: "publication_failed",
    };
  });
  session.change("endpoint", "https://edited.example/v1/relay");
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
    key: created?.key,
    fields: { discoveryUrl: "https://edited.example/v1/relay" },
  });
});
it("an unknown Add blocks repeat Save until reconciliation and retains its submitted entity key", async () => {
  const session = createRelayEditSession();
  session.begin();
  session.change("endpoint", "https://created.example/v1/relay");
  let created: typeof relay | undefined;
  await session.save(async (mutation) => {
    if (mutation.type !== "add" || mutation.configuration.kind !== "managed")
      throw new Error("expected_add");
    created = mutation.configuration;
    return {
      status: "unconfirmed",
      configurations: [],
      configurationApplied: false,
      credentialsRemoved: [],
      error: "lost_reply",
    };
  });
  const repeated = jest.fn();
  await session.save(repeated);
  expect(repeated).not.toHaveBeenCalled();
  await session.refresh(async () => [created!]);
  expect(session.getSnapshot()).toMatchObject({
    key: created?.key,
    recoveryRequired: false,
  });
});
it("a refreshed absent Add reuses its original submitted key instead of creating a second possible entity", async () => {
  const session = createRelayEditSession();
  session.begin();
  session.change("endpoint", "https://created.example/v1/relay");
  const keys: string[] = [];
  const action = async (
    mutation: import("../../packages/core/network/relayMutations").RelayMutation
  ): Promise<
    import("../../packages/core/network/relayMutations").RelayMutationResult
  > => {
    if (mutation.type !== "add") throw new Error("expected_add");
    keys.push(mutation.configuration.key);
    return {
      status: "unconfirmed",
      configurations: [],
      configurationApplied: false,
      credentialsRemoved: [],
      error: "lost_reply",
    };
  };
  await session.save(action);
  await session.refresh(async () => []);
  session.change("endpoint", "https://changed.example/v1/relay");
  await session.save(action);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});
