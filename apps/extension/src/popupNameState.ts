export function createPopupNameState<Identity, Device>(
  setIdentity: (value: Identity | null) => void,
  setDevices: (value: Device[]) => void
) {
  let revision = 0;

  function apply(state: { identity?: Identity | null; devices?: Device[] }) {
    if ("identity" in state) setIdentity(state.identity ?? null);
    if (Array.isArray(state.devices)) setDevices(state.devices);
  }

  return {
    revision: () => revision,
    publish(state: { identity?: Identity | null; devices?: Device[] }) {
      revision += 1;
      apply(state);
    },
    readPublished(
      requestedRevision: number,
      state: { identity?: Identity | null; devices?: Device[] }
    ) {
      if (requestedRevision !== revision) return;
      revision += 1;
      apply(state);
    },
    readIdentity(requestedRevision: number, identity: Identity | null) {
      if (requestedRevision === revision) setIdentity(identity);
    },
    readDevices(requestedRevision: number, devices: Device[]) {
      if (requestedRevision === revision) setDevices(devices);
    },
  };
}
