export function createRuntimeNotificationSelection() {
  const handlers = new Set<(id: string) => void | Promise<void>>();
  return {
    onSelect(handler: (id: string) => void | Promise<void>) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit(id: string) {
      handlers.forEach((handler) => void handler(id));
    },
  };
}
