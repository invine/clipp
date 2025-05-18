/**
 * Storage backend interface for clipboard history.
 */
export interface HistoryStorageBackend {
  set(key: string, value: any): Promise<void>;
  get(key: string): Promise<any>;
  getAll(): Promise<any[]>;
  remove(key: string): Promise<void>;
}

/**
 * In-memory default backend (for browser/mobile portability).
 */
export class InMemoryHistoryBackend implements HistoryStorageBackend {
  private store = new Map<string, any>();

  async set(key: string, value: any) {
    this.store.set(key, value);
  }
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async getAll() {
    return Array.from(this.store.values());
  }
  async remove(key: string) {
    this.store.delete(key);
  }
}
