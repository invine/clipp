type Owner = { stop(): void | Promise<void> };

/** The first caller starts every owned stop; later callers join the same result. */
export function createNotificationPeerShutdown(owners: readonly Owner[]) {
  let stopping: Promise<PromiseSettledResult<void>[]> | undefined;
  return {
    stop(
      origin: "deadline" | "finally"
    ): Promise<PromiseSettledResult<void>[]> {
      if (!stopping) {
        const ordered = [...owners];
        if (origin === "finally") ordered.reverse();
        stopping = Promise.allSettled(
          ordered.map((owner) => Promise.resolve().then(() => owner.stop()))
        );
      }
      return stopping;
    },
  };
}
