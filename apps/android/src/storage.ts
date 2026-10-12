import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { KVStorageBackend } from "../../../packages/core/trust";

type PreferenceAuthority = {
  isNative(): boolean;
  // eslint-disable-next-line no-unused-vars
  hasNativeValue(key: string): boolean;
  // eslint-disable-next-line no-unused-vars
  acceptNative(key?: string): void;
};
const durablePreferences = new Set([
  "theme",
  "sharingLifetimeMs",
  "localRetentionMs",
]);

const memory = new Map<string, string>();
export type CapacitorPreferencesStore = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

const hasLocalStorage = () => {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
};

async function readItem(
  key: string,
  preferences: CapacitorPreferencesStore,
  authority?: PreferenceAuthority
): Promise<string | null> {
  try {
    const res = await preferences.get({ key });
    if (authority) {
      authority.acceptNative(
        res.value !== null && res.value !== undefined ? key : undefined
      );
      if (
        (res.value !== null && res.value !== undefined) ||
        authority.hasNativeValue(key)
      )
        return res.value ?? null;
      // Only a genuinely absent native value may reuse a previously durable web preference.
      // A successful new native write/read binds this key, so stale web data cannot regain authority.
      return hasLocalStorage() ? localStorage.getItem(key) : null;
    }
    if (res.value !== null && res.value !== undefined) return res.value;
  } catch {
    if (authority?.isNative()) throw new Error("preference_read_unavailable");
    // Web preview may use its persistent web store before native authority exists.
  }

  if (hasLocalStorage()) {
    try {
      return localStorage.getItem(key);
    } catch {
      // fall through to memory
    }
  }
  return memory.get(key) ?? null;
}

async function writeItem(
  key: string,
  value: string,
  preferences: CapacitorPreferencesStore,
  authority?: PreferenceAuthority
): Promise<void> {
  try {
    await preferences.set({ key, value });
    authority?.acceptNative(key);
    return;
  } catch {
    if (authority?.isNative())
      throw new Error("preference_persistence_unavailable");
    // A successful native read still establishes authority when set fails.
    if (authority) {
      let readable = false;
      try {
        const current = await preferences.get({ key });
        authority.acceptNative(
          current.value !== null && current.value !== undefined
            ? key
            : undefined
        );
        readable = true;
      } catch {
        /* Native unavailable in web preview. */
      }
      if (readable) throw new Error("preference_persistence_unavailable");
    }
  }

  if (hasLocalStorage()) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      // fall through to memory
    }
  }
  if (authority) throw new Error("preference_persistence_unavailable");
  memory.set(key, value);
}

async function removeItem(
  key: string,
  preferences: CapacitorPreferencesStore
): Promise<void> {
  try {
    await preferences.remove({ key });
  } catch {
    // fall through to web/local fallback
  }
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore and fall through
    }
  }
  memory.delete(key);
}

/**
 * Hybrid key/value store using Capacitor Preferences when available,
 * falling back to localStorage or in-memory storage for web preview.
 * Durable preferences keep native authority once available; a failed native
 * write cannot be hidden in a different store. Web-only preview may use localStorage.
 */
export class LocalStorageBackend implements KVStorageBackend {
  private nativePreferenceAuthority = Capacitor.getPlatform() === "android";
  private readonly nativePreferenceKeys = new Set<string>();
  private readonly preferenceAuthority: PreferenceAuthority = {
    isNative: () => this.nativePreferenceAuthority,
    hasNativeValue: (key) => this.nativePreferenceKeys.has(key),
    acceptNative: (key) => {
      this.nativePreferenceAuthority = true;
      if (key !== undefined) this.nativePreferenceKeys.add(key);
    },
  };
  constructor(
    private prefix = "clipp-android:",
    private readonly preferences: CapacitorPreferencesStore = Preferences
  ) {}

  async get<T = any>(key: string): Promise<T | undefined> {
    const raw = await readItem(
      this.prefix + key,
      this.preferences,
      durablePreferences.has(key) ? this.preferenceAuthority : undefined
    );
    if (raw === null || raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    await writeItem(
      this.prefix + key,
      JSON.stringify(value),
      this.preferences,
      durablePreferences.has(key) ? this.preferenceAuthority : undefined
    );
  }

  async remove(key: string): Promise<void> {
    await removeItem(this.prefix + key, this.preferences);
  }
}
