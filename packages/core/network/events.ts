/**
 * Simple event bus for MessagingLayer events.
 */
type Handler<T> = (payload: T) => void;

export class EventBus<T> {
  private handlers: Handler<T>[] = [];
  on(handler: Handler<T>) {
    this.handlers.push(handler);
  }
  emit(payload: T) {
    for (const h of this.handlers) h(payload);
  }
}
