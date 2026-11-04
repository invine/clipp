import type { ClipHistoryStore } from "../history/store";
import type { MembershipStatus } from "../pairing/membership";
import type { StreamingMessagingTransport } from "../messaging/transport";
import type { ClipboardSyncManager } from "./clipboardSync";
import { createHistoryReconciliation } from "./historyReconciliation";
import { createLiveClipGossip } from "./liveClipGossip";

/**
 * Owns one Device Identity's live and history exchange attachment.
 * Call `activateReadyTransport` only after the runtime transport has started.
 */
export function createClipExchangeRuntime(options: {
  clipboardSync: ClipboardSyncManager;
  history: ClipHistoryStore;
  getLocalDeviceId(): Promise<string>;
  membershipStatus(peerId: string): Promise<MembershipStatus>;
  onMembershipChanged?(listener: () => void): () => void;
  now?: () => number;
}) {
  let generation = 0;
  let current:
    | {
        transport: StreamingMessagingTransport;
        historyReconciliation: ReturnType<typeof createHistoryReconciliation>;
      }
    | undefined;
  let operationQueue = Promise.resolve();
  let localCaptureStarted = false;

  const retireCurrent = async (
    networkAlreadyDisabled = false
  ): Promise<void> => {
    const previous = current;
    current = undefined;
    if (previous && !networkAlreadyDisabled)
      options.clipboardSync.startLocalOnly();
    else if (!localCaptureStarted) {
      options.clipboardSync.startLocalOnly();
      localCaptureStarted = true;
    }
    await previous?.historyReconciliation.stop();
  };

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const next = operationQueue.then(operation, operation);
    operationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  return {
    /** Starts durable local capture while the host prepares networking. */
    startLocalCapture(): void {
      if (localCaptureStarted) return;
      options.clipboardSync.startLocalOnly();
      localCaptureStarted = true;
    },

    /** Attaches both exchange protocols to a transport after host readiness. */
    activateReadyTransport(
      transport: StreamingMessagingTransport
    ): Promise<void> {
      const activation = ++generation;
      options.clipboardSync.startLocalOnly();
      localCaptureStarted = true;
      return enqueue(async () => {
        if (activation !== generation) return;
        await retireCurrent(true);
        if (activation !== generation) return;

        const liveGossip = createLiveClipGossip({
          transport,
          membershipStatus: options.membershipStatus,
          now: options.now,
        });
        const historyReconciliation = createHistoryReconciliation({
          transport,
          history: options.history,
          getLocalDeviceId: options.getLocalDeviceId,
          membershipStatus: options.membershipStatus,
          onMembershipChanged: options.onMembershipChanged,
          autoSync: options.clipboardSync.isAutoSync(),
          now: options.now,
        });
        current = { transport, historyReconciliation };
        options.clipboardSync.bindLiveGossip(liveGossip);
        historyReconciliation.start();
        if (activation !== generation) {
          await retireCurrent();
          return;
        }
        options.clipboardSync.activateNetwork();
      });
    },

    /** Retires exchange callbacks but keeps local capture alive. */
    retireTransport(): Promise<void> {
      ++generation;
      options.clipboardSync.startLocalOnly();
      localCaptureStarted = true;
      return enqueue(() => retireCurrent(true));
    },

    setAutoSync(enabled: boolean): void {
      options.clipboardSync.setAutoSync(enabled);
      current?.historyReconciliation.setAutoSync(enabled);
    },

    async stop(): Promise<void> {
      ++generation;
      options.clipboardSync.retireNetwork();
      await enqueue(async () => {
        const previous = current;
        current = undefined;
        await previous?.historyReconciliation.stop();
        await options.clipboardSync.stop();
        localCaptureStarted = false;
      });
    },
  };
}
