import type { KVStorageBackend } from '../../../packages/core/trust'

export type ChromeStorageArea = {
  get(keys: string[], callback: (result: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>, callback: () => void): void;
  remove(key: string, callback: () => void): void;
};

export class ChromeStorageBackend implements KVStorageBackend {
  constructor(
    private readonly storageArea: ChromeStorageArea = defaultChromeStorageArea(),
    private readonly getLastError: () => string | undefined = defaultChromeStorageError,
  ) {}

  async get<T = any>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.storageArea.get([key], (res) => {
        const error = this.getLastError();
        if (error) reject(new Error(error));
        else resolve(res[key] as T | undefined);
      })
    })
  }
  async set<T = any>(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storageArea.set({ [key]: value }, () => {
        const error = this.getLastError();
        if (error) reject(new Error(error));
        else resolve();
      })
    })
  }
  async remove(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storageArea.remove(key, () => {
        const error = this.getLastError();
        if (error) reject(new Error(error));
        else resolve();
      })
    })
  }
}

function defaultChromeStorageArea(): ChromeStorageArea {
  const runtime = globalThis as typeof globalThis & {
    chrome?: { storage?: { local?: ChromeStorageArea } };
  };
  const storageArea = runtime.chrome?.storage?.local;
  if (!storageArea) throw new Error("chrome_storage_unavailable");
  return storageArea;
}

function defaultChromeStorageError(): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    chrome?: { runtime?: { lastError?: { message?: string } } };
  };
  return runtime.chrome?.runtime?.lastError?.message;
}
