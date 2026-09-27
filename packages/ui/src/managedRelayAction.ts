export async function runManagedRelayAction(
  action: () => Promise<void> | void,
  reportError: (message: string) => void
): Promise<void> {
  try {
    await action();
  } catch (cause) {
    reportError(
      cause instanceof Error ? cause.message : "Could not complete relay action"
    );
  }
}
