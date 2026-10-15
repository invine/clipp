import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { KVStorageBackend } from "../../../packages/core/trust";
import {
  IDENTITY_RESET_JOURNAL_KEY,
  IDENTITY_RESET_RECEIPT_KEY,
  IDENTITY_RESET_COMPLETED_KEY,
} from "../../../packages/core/trust/manualIdentityReset";

const resetMetadataKeys = new Set([
  IDENTITY_RESET_JOURNAL_KEY,
  IDENTITY_RESET_RECEIPT_KEY,
  IDENTITY_RESET_COMPLETED_KEY,
]);

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
/** Native calls resolve only after synchronous commit; failure poisons reads until restart. */
export type AndroidDurablePreferences = CapacitorPreferencesStore;
const durableNative = registerPlugin<AndroidDurablePreferences>(
  "IdentityResetStorage"
);
type ResetStorageOptions = {
  native: AndroidDurablePreferences;
  isNative(): boolean;
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
    private readonly preferences: CapacitorPreferencesStore = Preferences,
    private readonly resetOptions: ResetStorageOptions = {
      native: durableNative,
      isNative: () => Capacitor.getPlatform() === "android",
    }
  ) {}

  /** No fallback is permitted for reset effects or native startup inspection. */
  readonly identityResetStorage: KVStorageBackend = {
    get: async <T>(key: string): Promise<T | undefined> => {
      this.requireNativeResetStorage();
      const { value } = await this.resetOptions.native.get({
        key: this.prefix + key,
      });
      // A former web/memory journal cannot be treated as an empty native installation.
      const fallback = this.readResetFallback(key);
      if (value === null || value === undefined) {
        if (fallback !== null)
          throw new Error("identity_reset_fallback_unreconciled");
        return undefined;
      }
      return JSON.parse(value) as T;
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      this.requireNativeResetStorage();
      await this.resetOptions.native.set({
        key: this.prefix + key,
        value: JSON.stringify(value),
      });
      this.removeResetFallback(key);
    },
    remove: async (key: string): Promise<void> => {
      this.requireNativeResetStorage();
      await this.resetOptions.native.remove({ key: this.prefix + key });
      this.removeResetFallback(key);
    },
  };

  private requireNativeResetStorage(): void {
    if (!this.resetOptions.isNative())
      throw new Error("native_identity_reset_storage_required");
  }

  private readResetFallback(key: string): string | null {
    // Access errors are unknown state, never evidence of absence.
    const web =
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(this.prefix + key);
    return web ?? memory.get(this.prefix + key) ?? null;
  }

  private removeResetFallback(key: string): void {
    if (typeof localStorage !== "undefined")
      localStorage.removeItem(this.prefix + key);
    memory.delete(this.prefix + key);
    if (this.readResetFallback(key) !== null)
      throw new Error("identity_reset_fallback_cleanup_failed");
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    if (this.resetOptions.isNative() && resetMetadataKeys.has(key))
      return this.identityResetStorage.get<T>(key);
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
    if (this.resetOptions.isNative() && resetMetadataKeys.has(key))
      return this.identityResetStorage.set(key, value);
    await writeItem(
      this.prefix + key,
      JSON.stringify(value),
      this.preferences,
      durablePreferences.has(key) ? this.preferenceAuthority : undefined
    );
  }

  async remove(key: string): Promise<void> {
    if (this.resetOptions.isNative() && resetMetadataKeys.has(key))
      return this.identityResetStorage.remove(key);
    await removeItem(this.prefix + key, this.preferences);
  }
}
