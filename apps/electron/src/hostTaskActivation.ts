/** Main-process activation retention. Delivery begins only when the current renderer's
 * mounted task consumer has subscribed; hidden windows retain that renderer owner.
 * A send must return true to consume pending activation; failure waits for readiness. */
export function createElectronTaskActivation(deliver: () => boolean) {
  let owner: string | null = null;
  let pending = false;
  function flush() {
    if (!owner || !pending) return;
    try {
      if (deliver()) {
        pending = false;
        return;
      }
    } catch {
      // The renderer can disappear between checking readiness and sending.
    }
    owner = null;
  }
  return {
    activate() {
      pending = true;
      flush();
    },
    setReady(documentOwner: string, ready: boolean) {
      if (ready) {
        owner = documentOwner;
        flush();
      } else if (owner === documentOwner) owner = null;
    },
    invalidate() {
      owner = null;
    },
  };
}
