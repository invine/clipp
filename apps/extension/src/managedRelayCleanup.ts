export async function stopManagedOffscreenResources(operations: {
  controller(): Promise<void>;
  reconnects(): Promise<void>;
  transport(): Promise<void>;
}): Promise<void> {
  let firstError: unknown;
  for (const operation of [
    operations.controller,
    operations.reconnects,
    operations.transport,
  ]) {
    try {
      await operation();
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError) throw firstError;
}
