import { multiaddr } from "@multiformats/multiaddr";

type MultiaddrLike = {
  getComponents?: () => Array<{ code?: number; name?: string; value?: string }>;
  [key: string]: any;
};

type LegacyMethodName =
  | "getPeerId"
  | "protoCodes"
  | "protoNames"
  | "protos"
  | "stringTuples"
  | "toOptions";
// eslint-disable-next-line no-unused-vars
type LegacyMethod = (this: MultiaddrLike) => any;

export function patchGlobalMultiaddrCompat(): void {
  try {
    const proto = Object.getPrototypeOf(multiaddr("/"));
    if (!proto) return;
    addLegacyMethods(proto);
  } catch {
    // If multiaddr construction is unavailable, per-instance shims still apply below.
  }
}

export function ensureLegacyMultiaddrApi<T>(addr: T): T {
  if (!addr || typeof addr !== "object" || typeof (addr as MultiaddrLike).getComponents !== "function") {
    return addr;
  }
  addLegacyMethods(addr as MultiaddrLike);
  return addr;
}

export function getPeerIdFromMultiaddr(addr: any): string | undefined {
  const peerId =
    typeof addr?.getPeerId === "function"
      ? addr.getPeerId()
      : peerIdFromComponents(getComponents(addr));
  return peerId ?? undefined;
}

function addLegacyMethods(target: MultiaddrLike): void {
  define(target, "getPeerId", legacyGetPeerId);
  define(target, "protoCodes", legacyProtoCodes);
  define(target, "protoNames", legacyProtoNames);
  define(target, "protos", legacyProtos);
  define(target, "stringTuples", legacyStringTuples);
  define(target, "toOptions", legacyToOptions);
}

const legacyGetPeerId: LegacyMethod = function () {
  return peerIdFromComponents(getComponents(this));
};

const legacyProtoCodes: LegacyMethod = function () {
  return getComponents(this)
    .map((c) => c?.code)
    .filter((code): code is number => code != null);
};

const legacyProtoNames: LegacyMethod = function () {
  return getComponents(this)
    .map((c) => c?.name)
    .filter((name): name is string => Boolean(name));
};

const legacyProtos: LegacyMethod = function () {
  return getComponents(this).map((c) => ({ code: c?.code, name: c?.name }));
};

const legacyStringTuples: LegacyMethod = function () {
  return getComponents(this).map((c) => [c?.code, c?.value]);
};

const legacyToOptions: LegacyMethod = function () {
  const components = getComponents(this);
  const host = components.find((c) =>
    ["ip4", "ip6", "dns", "dns4", "dns6"].includes(c?.name || "")
  );
  const transport = components.find((c) => ["tcp", "udp"].includes(c?.name || ""));
  return {
    family: host?.name === "ip6" ? 6 : 4,
    host: host?.value,
    transport: transport?.name,
    port: transport?.value ? Number(transport.value) : undefined,
  };
};

function define(target: MultiaddrLike, name: LegacyMethodName, value: LegacyMethod): void {
  if (typeof target[name] === "function") return;
  try {
    Object.defineProperty(target, name, { value, configurable: true });
  } catch {
    // Some multiaddr objects may be non-extensible; callers still get the original object.
  }
}

function getComponents(addr: MultiaddrLike): Array<{ code?: number; name?: string; value?: string }> {
  try {
    return typeof addr?.getComponents === "function" ? addr.getComponents() : [];
  } catch {
    return [];
  }
}

function peerIdFromComponents(
  components: Array<{ code?: number; name?: string; value?: string }>
): string | null {
  let peerId: string | undefined;
  for (const component of components) {
    if (component?.name === "p2p" || component?.code === 421) {
      peerId = component.value;
    }
    if (component?.name === "p2p-circuit" || component?.code === 290) {
      peerId = undefined;
    }
  }
  return peerId || null;
}
