import {
  normalizeRelayConfigurations,
  type RelayConfiguration,
} from "./managedRelays";
export type RelayFields = {
  name?: string;
  kind?: "managed" | "explicit";
  discoveryUrl?: string;
  peerId?: string;
  addresses?: string[];
};
export type RelayMutation =
  | { type: "add"; configuration: RelayConfiguration }
  | { type: "edit"; key: string; fields: RelayFields }
  | { type: "remove"; key: string };
export function applyRelayMutation(
  current: RelayConfiguration[],
  mutation: RelayMutation
): RelayConfiguration[] {
  if (!mutation || typeof mutation !== "object")
    throw new Error("invalid_relay_mutation");
  if (mutation.type === "add") {
    if (current.some((config) => config.key === mutation.configuration?.key))
      throw new Error("relay_already_exists");
    return normalizeRelayConfigurations([...current, mutation.configuration]);
  }
  const target = current.find((config) => config.key === mutation.key);
  if (!target) throw new Error("relay_not_found");
  if (mutation.type === "remove")
    return current.filter((config) => config.key !== mutation.key);
  if (
    mutation.type !== "edit" ||
    !mutation.fields ||
    typeof mutation.fields !== "object"
  )
    throw new Error("invalid_relay_mutation");
  if (
    Object.keys(mutation.fields).some(
      (key) =>
        !["name", "kind", "discoveryUrl", "peerId", "addresses"].includes(key)
    )
  )
    throw new Error("invalid_relay_fields");
  const merged = { ...target, ...mutation.fields };
  const replacement: RelayConfiguration =
    merged.kind === "managed"
      ? {
          key: target.key,
          name: merged.name,
          kind: "managed",
          discoveryUrl: "discoveryUrl" in merged ? merged.discoveryUrl! : "",
        }
      : {
          key: target.key,
          name: merged.name,
          kind: "explicit",
          peerId: "peerId" in merged ? merged.peerId! : "",
          addresses: "addresses" in merged ? merged.addresses! : [],
        };
  return normalizeRelayConfigurations(
    current.map((config) => (config.key === target.key ? replacement : config))
  );
}
export type RelayMutationResult = {
  status: "applied" | "rejected" | "partial" | "unconfirmed";
  configurations: RelayConfiguration[];
  configurationApplied: boolean;
  credentialsRemoved: string[];
  error?: string;
};
export type RelayMutationOperations = {
  read(): RelayConfiguration[];
  load?(): Promise<unknown>;
  erase?(url: string): Promise<void>;
  write(next: RelayConfiguration[]): Promise<void>;
  accept(next: RelayConfiguration[]): void;
  apply(next: RelayConfiguration[]): Promise<void>;
  reconcile(): Promise<void>;
};
/** Serialize configuration persistence, without holding another entity behind auth/network setup. */
export function createRelayMutationOwner(operations: RelayMutationOperations) {
  let writes: Promise<void> = Promise.resolve();
  return {
    async refresh(): Promise<RelayConfiguration[]> {
      const refresh = writes.then(async () => {
        const current = operations.load
          ? normalizeRelayConfigurations(await operations.load())
          : operations.read();
        operations.accept(current);
        const application = Promise.resolve()
          .then(() => operations.apply(current))
          .then(
            () => null,
            (cause: unknown) => cause
          );
        return { application };
      });
      writes = refresh.then(
        () => undefined,
        () => undefined
      );
      const result = await refresh;
      const error = await result.application;
      await operations.reconcile();
      if (error) throw error;
      return operations.read();
    },
    async mutate(mutation: RelayMutation): Promise<RelayMutationResult> {
      const committed = writes.then(async () => {
        const credentialsRemoved: string[] = [];
        let configurationApplied = false;
        let writeStarted = false;
        const previous = operations.read();
        let next: RelayConfiguration[] | null = null;
        try {
          next = applyRelayMutation(previous, mutation);
          if (operations.erase) {
            const endpoints = new Set(
              next
                .filter((entry) => entry.kind === "managed")
                .map((entry) => entry.discoveryUrl)
            );
            for (const entry of previous)
              if (
                entry.kind === "managed" &&
                !endpoints.has(entry.discoveryUrl)
              ) {
                await operations.erase(entry.discoveryUrl);
                credentialsRemoved.push(entry.discoveryUrl);
              }
          }
          writeStarted = true;
          await operations.write(next);
          configurationApplied = true;
          operations.accept(next);
          // Begin applications in commit order. Their network waits do not own the write queue.
          const appliedNext = next;
          const application = Promise.resolve().then(() =>
            operations.apply(appliedNext)
          );
          // Attach a handler immediately, including when another write is still waiting.
          const settled = application.then(
            () => null,
            (error: unknown) => error
          );
          return {
            credentialsRemoved,
            configurationApplied,
            application: settled,
            error: null,
            unconfirmed: false,
          };
        } catch (error) {
          let application: Promise<unknown> = Promise.resolve(null);
          let unconfirmed = writeStarted;
          if (writeStarted && operations.load) {
            try {
              const actual = normalizeRelayConfigurations(
                await operations.load()
              );
              configurationApplied =
                JSON.stringify(actual) === JSON.stringify(next);
              operations.accept(actual);
              if (JSON.stringify(actual) !== JSON.stringify(previous))
                application = Promise.resolve()
                  .then(() => operations.apply(actual))
                  .then(
                    () => null,
                    (cause: unknown) => cause
                  );
              unconfirmed = false;
            } catch {
              /* persisted effect remains unconfirmed; retain the usable projection */
            }
          }
          return {
            credentialsRemoved,
            configurationApplied,
            application,
            error,
            unconfirmed,
          };
        }
      });
      writes = committed.then(
        () => undefined,
        () => undefined
      );
      const committedResult = await committed;
      const applicationError = await committedResult.application;
      let error = committedResult.error ?? applicationError;
      let reconciliationFailed = false;
      try {
        await operations.reconcile();
      } catch (cause) {
        reconciliationFailed = true;
        error ??= cause;
      }
      return {
        status: error
          ? committedResult.configurationApplied ||
            committedResult.credentialsRemoved.length
            ? "partial"
            : reconciliationFailed || committedResult.unconfirmed
              ? "unconfirmed"
              : "rejected"
          : "applied",
        configurations: operations.read(),
        configurationApplied: committedResult.configurationApplied,
        credentialsRemoved: committedResult.credentialsRemoved,
        ...(error
          ? {
              error:
                error instanceof Error
                  ? error.message
                  : "relay_outcome_unconfirmed",
            }
          : {}),
      };
    },
  };
}
