import type { PairingErrorState, PairingWaitingState, createPairingSession } from "./session";

export type PairingSessionHandle = ReturnType<typeof createPairingSession>;

/** Shared lifecycle and public-state bookkeeping for runtime Pairing sessions. */
export function createPairingRuntimeCoordinator(options: {
  onChanged?(): void | Promise<void>;
}) {
  const sessions = new Map<string, PairingSessionHandle>();
  const waitingByPeer = new Map<string, { targetPeerId: string; expiresAtUnixMs: number }>();
  const errorsBySource = new Map<string, PairingErrorState[]>();

  const publish = () => options.onChanged?.();
  const sessionErrorSource = (targetPeerId: string) => `session:${targetPeerId}`;
  const errorsChanged = (source: string, errors: PairingErrorState[]) => {
    if (errors.length) errorsBySource.set(source, errors);
    else errorsBySource.delete(source);
    void publish();
  };

  return {
    getOrAttachFallbackSession(targetPeerId: string, fallback: PairingSessionHandle): PairingSessionHandle {
      const current = sessions.get(targetPeerId);
      if (current) return current;
      sessions.set(targetPeerId, fallback);
      return fallback;
    },
    async replace(targetPeerId: string, session: PairingSessionHandle, fallback?: PairingSessionHandle): Promise<PairingSessionHandle> {
      if (fallback?.retrying(targetPeerId)) {
        await session.stop();
        sessions.set(targetPeerId, fallback);
        return fallback;
      }
      const previous = sessions.get(targetPeerId);
      if (previous && previous !== session && previous !== fallback) await previous.stop();
      sessions.set(targetPeerId, session);
      errorsBySource.delete(sessionErrorSource(targetPeerId));
      await publish();
      return session;
    },
    async remove(targetPeerId: string, expected?: PairingSessionHandle): Promise<boolean> {
      if (expected && sessions.get(targetPeerId) !== expected) return false;
      sessions.delete(targetPeerId);
      waitingByPeer.delete(targetPeerId);
      errorsBySource.delete(sessionErrorSource(targetPeerId));
      await publish();
      return true;
    },
    waitingChanged(targetPeerId: string, session: PairingSessionHandle, waiting: PairingWaitingState[]): void {
      if (sessions.get(targetPeerId) !== session) return;
      const state = waiting.find((entry) => entry.targetPeerId === targetPeerId);
      if (state) waitingByPeer.set(targetPeerId, { targetPeerId, expiresAtUnixMs: Number(state.expiresAtUnixMs) });
      else waitingByPeer.delete(targetPeerId);
      void publish();
    },
    waitingForSessionChanged(session: PairingSessionHandle, waiting: PairingWaitingState[]): void {
      for (const [targetPeerId, current] of sessions) {
        if (current !== session) continue;
        const state = waiting.find((entry) => entry.targetPeerId === targetPeerId);
        if (state) waitingByPeer.set(targetPeerId, { targetPeerId, expiresAtUnixMs: Number(state.expiresAtUnixMs) });
        else waitingByPeer.delete(targetPeerId);
      }
      void publish();
    },
    fallbackErrorsChanged(errors: PairingErrorState[]): void {
      errorsChanged("fallback", errors);
    },
    sessionErrorsChanged(targetPeerId: string, errors: PairingErrorState[]): void {
      errorsChanged(sessionErrorSource(targetPeerId), errors);
    },
    waiting(): Array<{ targetPeerId: string; expiresAtUnixMs: number }> {
      return [...waitingByPeer.values()];
    },
    errors(): PairingErrorState[] {
      const byPeer = new Map<string, PairingErrorState>();
      for (const errors of errorsBySource.values()) {
        for (const error of errors) byPeer.set(error.targetPeerId, error);
      }
      return [...byPeer.values()];
    },
    async stop(fallbackSession?: PairingSessionHandle): Promise<void> {
      await Promise.all([...new Set([...sessions.values(), ...(fallbackSession ? [fallbackSession] : [])])].map((session) => session.stop()));
      sessions.clear();
      waitingByPeer.clear();
      errorsBySource.clear();
      await publish();
    },
  };
}
