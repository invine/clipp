import type { DeviceMembershipAdmissions } from "./membership";

/** Applies the shared disconnect policy after Pairing has authenticated a sender. */
export function createPairingRejectionCleanup(options: {
  membership: Pick<DeviceMembershipAdmissions, "membershipStatus">;
  isCurrentTransport(peerId: string): boolean;
  disconnect(peerId: string): Promise<void> | void;
}) {
  const inFlight = new Map<string, Promise<void>>();

  return (authenticatedPeerId: string | undefined): Promise<void> => {
    if (
      !authenticatedPeerId ||
      !options.isCurrentTransport(authenticatedPeerId)
    )
      return Promise.resolve();

    const existing = inFlight.get(authenticatedPeerId);
    if (existing) return existing;

    const task = (async () => {
      try {
        const status =
          await options.membership.membershipStatus(authenticatedPeerId);
        // Unknown is not a confirmed non-member. Recheck ownership after the
        // asynchronous Membership View read so a retired transport stays inert.
        if (
          status === "active" ||
          status === "unknown" ||
          !options.isCurrentTransport(authenticatedPeerId)
        )
          return;
        await options.disconnect(authenticatedPeerId);
      } catch {
        // Rejection cleanup is best-effort. A failed read or disconnect must
        // never change the Pairing result or tear down unrelated runtime work.
      }
    })();
    inFlight.set(authenticatedPeerId, task);
    void task.then(() => {
      if (inFlight.get(authenticatedPeerId) === task)
        inFlight.delete(authenticatedPeerId);
    });
    return task;
  };
}
