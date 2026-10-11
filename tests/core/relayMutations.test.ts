jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
import {
  applyRelayMutation,
  createRelayMutationOwner,
} from "../../packages/core/network/relayMutations";
import type { RelayConfiguration } from "../../packages/core/network/managedRelays";
const a: RelayConfiguration = {
  key: "a",
  name: "A",
  kind: "managed",
  discoveryUrl: "https://old.example/v1/relay",
};
const b: RelayConfiguration = {
  key: "b",
  name: "B",
  kind: "managed",
  discoveryUrl: "https://other.example/v1/relay",
};
it("explicit Save overwrites only edited fields over current configurations", () => {
  const current = [
    {
      ...a,
      name: "External name",
      discoveryUrl: "https://new.example/v1/relay",
    },
    b,
  ];
  expect(
    applyRelayMutation(current, {
      type: "edit",
      key: "a",
      fields: { name: "My name" },
    })
  ).toEqual([
    { ...a, name: "My name", discoveryUrl: "https://new.example/v1/relay" },
    b,
  ]);
  expect(() =>
    applyRelayMutation([b], {
      type: "edit",
      key: "a",
      fields: { name: "My name" },
    })
  ).toThrow("relay_not_found");
});
it("reports actual erased credentials when persistence fails and preserves the current configuration", async () => {
  let current: RelayConfiguration[] = [a, b];
  const credentials = new Set([a.discoveryUrl, b.discoveryUrl]);
  const owner = createRelayMutationOwner({
    read: () => current,
    erase: async (url) => {
      credentials.delete(url);
    },
    write: async () => {
      throw new Error("disk_full");
    },
    accept: (next) => {
      current = next;
    },
    apply: async () => {},
    reconcile: async () => {},
  });
  const result = await owner.mutate({ type: "remove", key: "a" });
  expect(result).toMatchObject({
    status: "partial",
    configurations: [a, b],
    credentialsRemoved: [a.discoveryUrl],
    error: "disk_full",
    configurationApplied: false,
  });
  expect(credentials).toEqual(new Set([b.discoveryUrl]));
});
it("serializes current-state edits while an unrelated relay application waits on the network", async () => {
  let current: RelayConfiguration[] = [a, b];
  let finish!: () => void;
  let first = true;
  const owner = createRelayMutationOwner({
    read: () => current,
    write: async () => {},
    accept: (next) => {
      current = next;
    },
    apply: async () => {
      if (first) {
        first = false;
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      }
    },
    reconcile: async () => {},
  });
  const waiting = owner.mutate({
    type: "edit",
    key: "a",
    fields: { name: "Edited A" },
  });
  const applied = await owner.mutate({
    type: "edit",
    key: "b",
    fields: { name: "Edited B" },
  });
  expect(applied.configurations).toEqual([
    { ...a, name: "Edited A" },
    { ...b, name: "Edited B" },
  ]);
  finish();
  await waiting;
});
it("reconciles a durable configuration effect when the persistence acknowledgement rejects", async () => {
  let persisted: RelayConfiguration[] = [a, b];
  let current: RelayConfiguration[] = [a, b];
  const applied: RelayConfiguration[][] = [];
  const owner = createRelayMutationOwner({
    read: () => current,
    load: async () => persisted,
    write: async (next) => {
      persisted = next;
      throw new Error("acknowledgement_lost");
    },
    accept: (next) => {
      current = next;
    },
    apply: async (next) => {
      applied.push(next);
    },
    reconcile: async () => {},
  });
  const result = await owner.mutate({ type: "remove", key: "a" });
  expect(result).toMatchObject({
    status: "partial",
    configurations: [b],
    configurationApplied: true,
    error: "acknowledgement_lost",
  });
  expect(applied).toEqual([[b]]);
});
it("owning Refresh reconciles an unknown Add after persisted configuration readback becomes available", async () => {
  let persisted: RelayConfiguration[] = [],
    current: RelayConfiguration[] = [];
  let unavailable = true;
  const owner = createRelayMutationOwner({
    read: () => current,
    load: async () => {
      if (unavailable) throw new Error("read_unavailable");
      return persisted;
    },
    write: async (next) => {
      persisted = next;
      throw new Error("acknowledgement_lost");
    },
    accept: (next) => {
      current = next;
    },
    apply: async () => {},
    reconcile: async () => {},
  });
  expect(await owner.mutate({ type: "add", configuration: a })).toMatchObject({
    status: "unconfirmed",
    configurationApplied: false,
  });
  unavailable = false;
  expect(await owner.refresh()).toEqual([a]);
});
