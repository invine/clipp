/** Shared duplicate guard and pending/error settlement for notification actions. */
export function createNotificationActionLifecycle(options: {
  isCurrent(): boolean;
  setPending(pending: boolean): void;
  setError(error: boolean): void;
  publish(): void;
  refresh(): Promise<unknown>;
}) {
  let running = false;
  return async function run(action: () => Promise<unknown>): Promise<void> {
    if (running) return;
    running = true;
    options.setPending(true);
    options.setError(false);
    options.publish();
    try {
      await action();
      await options.refresh();
    } catch {
      if (options.isCurrent()) options.setError(true);
    } finally {
      running = false;
      options.setPending(false);
      if (options.isCurrent()) options.publish();
    }
  };
}
