import type { DeviceMembershipAdmissions } from "./membership";
import type { TransportOwner } from "../messaging/transport";

/** Applies the shared disconnect policy after Pairing has authenticated a sender. */
export function createPairingRejectionCleanup(options: {
  membership: Pick<DeviceMembershipAdmissions, "membershipStatus">;
  isCurrentTransport(peerId: string, owner: TransportOwner): boolean;
  disconnect(peerId: string, owner: TransportOwner): Promise<void> | void;
}) {
  const inFlight = new Map<TransportOwner, Map<string, Promise<void>>>();

  return (
    authenticatedPeerId: string | undefined,
    owner: TransportOwner | undefined
  ): Promise<void> => {
    if (
      !authenticatedPeerId ||
      owner === undefined ||
      !options.isCurrentTransport(authenticatedPeerId, owner)
    )
      return Promise.resolve();

    let transportWork = inFlight.get(owner);
    if (!transportWork) {
      transportWork = new Map();
      inFlight.set(owner, transportWork);
    }
    const existing = transportWork.get(authenticatedPeerId);
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
          !options.isCurrentTransport(authenticatedPeerId, owner)
        )
          return;
        await options.disconnect(authenticatedPeerId, owner);
      } catch {
        // Rejection cleanup is best-effort. A failed read or disconnect must
        // never change the Pairing result or tear down unrelated runtime work.
      }
    })();
    transportWork.set(authenticatedPeerId, task);
    void task.then(() => {
      if (transportWork?.get(authenticatedPeerId) !== task) return;
      transportWork.delete(authenticatedPeerId);
      if (transportWork.size === 0 && inFlight.get(owner) === transportWork)
        inFlight.delete(owner);
    });
    return task;
  };
}
