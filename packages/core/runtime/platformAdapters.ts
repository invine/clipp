import type { KVStorageBackend } from "../trust";
import { RUNTIME_CAPABILITIES } from "./capabilities";
import type {
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeRelayAccess,
  RuntimeRelayPorts,
} from "./contract";
import {
  createKVRuntimeApplicationState,
  createKVRuntimeIdentityStorage,
} from "./persistence";

export type RuntimeAdapterPorts<Identity, ApplicationState, PublicState> = Omit<
  RuntimeAdapter<Identity, ApplicationState, PublicState>,
  "capabilities" | "relays"
> & { relays: RuntimeRelayPorts };

export type RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState> = Omit<
  RuntimeAdapterPorts<Identity, ApplicationState, PublicState>,
  "identity" | "state"
> & {
  storage: KVStorageBackend;
  identityKey: string;
  applicationStateKey: string;
  initialApplicationState(): ApplicationState;
};

function createRuntimeRelayAccess(
  capabilities: RuntimeCapabilities,
  ports: RuntimeRelayPorts
): RuntimeRelayAccess {
  if (capabilities.relayConfiguration === "fixed") {
    return { mode: "fixed", readAddresses: ports.readAddresses };
  }
  if (!ports.updateAddresses) throw new Error("editable_relays_require_update_access");
  return {
    mode: "editable",
    readAddresses: ports.readAddresses,
    updateAddresses: ports.updateAddresses,
  };
}

function createPlatformRuntimeAdapter<Identity, ApplicationState, PublicState>(
  capabilities: RuntimeCapabilities,
  dependencies: RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState>
): RuntimeAdapter<Identity, ApplicationState, PublicState> {
  const {
    storage,
    identityKey,
    applicationStateKey,
    initialApplicationState,
    relays,
    ...adapterPorts
  } = dependencies;
  return {
    ...adapterPorts,
    capabilities,
    identity: createKVRuntimeIdentityStorage<Identity>({ storage, key: identityKey }),
    state: createKVRuntimeApplicationState<ApplicationState>({
      storage,
      key: applicationStateKey,
      initialState: initialApplicationState,
    }),
    relays: createRuntimeRelayAccess(capabilities, relays),
  };
}

export function createElectronRuntimeAdapter<Identity, ApplicationState, PublicState>(
  dependencies: RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState>
): RuntimeAdapter<Identity, ApplicationState, PublicState> {
  return createPlatformRuntimeAdapter(RUNTIME_CAPABILITIES.electron, dependencies);
}

export function createAndroidRuntimeAdapter<Identity, ApplicationState, PublicState>(
  dependencies: RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState>
): RuntimeAdapter<Identity, ApplicationState, PublicState> {
  return createPlatformRuntimeAdapter(RUNTIME_CAPABILITIES.android, dependencies);
}

export function createChromeExtensionRuntimeAdapter<Identity, ApplicationState, PublicState>(
  dependencies: RuntimePlatformAdapterDependencies<Identity, ApplicationState, PublicState>
): RuntimeAdapter<Identity, ApplicationState, PublicState> {
  return createPlatformRuntimeAdapter(RUNTIME_CAPABILITIES.chromeExtension, dependencies);
}
