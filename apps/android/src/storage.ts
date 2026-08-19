import { Preferences } from "@capacitor/preferences";
import type { KVStorageBackend } from "../../../packages/core/trust";

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

async function readItem(key: string, preferences: CapacitorPreferencesStore): Promise<string | null> {
  try {
    const res = await preferences.get({ key });
    if (res.value !== null && res.value !== undefined) return res.value;
  } catch {
    // fall through to web/local fallback
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
): Promise<void> {
  try {
    await preferences.set({ key, value });
    return;
  } catch {
    // fall through to web/local fallback
  }

  if (hasLocalStorage()) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      // fall through to memory
    }
  }
  memory.set(key, value);
}

async function removeItem(key: string, preferences: CapacitorPreferencesStore): Promise<void> {
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
 */
export class LocalStorageBackend implements KVStorageBackend {
  constructor(
    private prefix = "clipp-android:",
    private readonly preferences: CapacitorPreferencesStore = Preferences,
  ) {}

  async get<T = any>(key: string): Promise<T | undefined> {
    const raw = await readItem(this.prefix + key, this.preferences);
    if (raw === null || raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    await writeItem(this.prefix + key, JSON.stringify(value), this.preferences);
  }

  async remove(key: string): Promise<void> {
    await removeItem(this.prefix + key, this.preferences);
  }
}
