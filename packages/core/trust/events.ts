export class TypedEventEmitter<T extends Record<string, any>> {
  private handlers: { [K in keyof T]?: Array<(payload: T[K]) => void> } = {};
  on<K extends keyof T>(event: K, cb: (payload: T[K]) => void) {
    (this.handlers[event] ||= []).push(cb);
  }
  emit<K extends keyof T>(event: K, payload: T[K]) {
    for (const h of this.handlers[event] || []) h(payload);
  }
}
