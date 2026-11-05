/**
 * Stops identity-bound services, drains work admitted before the identity
 * fence, then confirms a final stop before identity-scoped cleanup may begin.
 */
export async function retireIdentityRuntime(options: {
  stop(): Promise<void> | void;
  drain(): Promise<void> | void;
  finalStop(): Promise<void> | void;
}): Promise<void> {
  try {
    await options.stop();
  } catch {
    // A failed acknowledgement can still follow a committed stop. Drain and
    // final stop provide the authoritative retirement confirmation.
  }

  let drainError: unknown;
  try {
    await options.drain();
  } catch (error) {
    drainError = error;
  }

  let finalStopError: unknown;
  try {
    await options.finalStop();
  } catch (error) {
    finalStopError = error;
  }

  if (drainError !== undefined) throw drainError;
  if (finalStopError !== undefined) throw finalStopError;
}
