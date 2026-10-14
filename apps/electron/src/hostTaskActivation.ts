/** Main-process activation retention. Delivery begins only when the current renderer's
 * mounted task consumer has subscribed; hidden windows retain that renderer owner. */
export function createElectronTaskActivation(deliver: () => void) {
  let owner: string | null = null;
  let pending = false;
  function flush() {
    if (!owner || !pending) return;
    pending = false;
    deliver();
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
