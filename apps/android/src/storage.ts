import { Preferences } from "@capacitor/preferences";
import type { StorageBackend } from "../../packages/core/trust/trusted-devices";

const memory = new Map<string, string>();
const hasLocalStorage = () => {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
};

async function readItem(key: string): Promise<string | null> {
  try {
    const res = await Preferences.get({ key });
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

async function writeItem(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
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

async function removeItem(key: string): Promise<void> {
  try {
    await Preferences.remove({ key });
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
export class LocalStorageBackend implements StorageBackend {
  constructor(private prefix = "clipp-android:") {}

  async get<T = any>(key: string): Promise<T | undefined> {
    const raw = await readItem(this.prefix + key);
    if (raw === null || raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    await writeItem(this.prefix + key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await removeItem(this.prefix + key);
  }
}
