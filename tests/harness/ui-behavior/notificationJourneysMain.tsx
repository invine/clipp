import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import type { RuntimeNotificationAvailability } from "../../../packages/core/runtime/notifications";
import { bindNotificationRequests } from "../../../packages/ui/src/notificationRequests";
import { ClipboardWorkspace } from "../../../packages/ui/src/ClipboardWorkspace";
import type { ClipboardAppProps } from "../../../packages/ui/src/ClipboardApp";
import { createUiRuntimeStore } from "../../../packages/ui/src/runtimeAdapter";
import { useNotificationAvailability } from "../../../packages/ui/src/useNotificationAvailability";
import { createUiSession } from "../../../packages/ui/src/uiSession";
import type { NotificationAvailabilityBridge } from "../../../packages/ui/src/useNotificationAvailability";
import type { NotificationRequestsBridge } from "../../../packages/ui/src/notificationRequests";
import type { PendingRequest } from "../../../packages/ui/src/types";
import "../../../packages/ui/src/styles.css";
import "../../../packages/ui/src/host.css";
import "./scenario.css";

type ApprovalEntry = { id: string; requestId: string };

let availability: RuntimeNotificationAvailability = {
  app: "blocked",
  channel: "blocked",
  displayError: null,
};
let failNextAvailabilityRead = false;
let resolvePermission: (() => void) | undefined;
let resolveSettingsAction: (() => void) | undefined;
const availabilityListeners = new Set<() => void>();
const availabilityBridge: NotificationAvailabilityBridge = {
  async getNotificationAvailability() {
    if (failNextAvailabilityRead) {
      failNextAvailabilityRead = false;
      throw new Error("notification_availability_unavailable");
    }
    return { ...availability };
  },
  async openNotificationSettings() {
    await new Promise<void>((resolve) => {
      resolveSettingsAction = resolve;
    });
  },
  async requestNotificationPermission() {
    await new Promise<void>((resolve) => {
      resolvePermission = resolve;
    });
    return { ...availability };
  },
  onNotificationAvailabilityChanged(listener) {
    availabilityListeners.add(listener);
    return () => availabilityListeners.delete(listener);
  },
};

let approvalEntries: ApprovalEntry[] = [];
let acknowledged: string[] = [];
const approvalListeners = new Set<() => void>();
const acknowledgmentListeners = new Set<() => void>();
const subscribeAcknowledged = (listener: () => void) => {
  acknowledgmentListeners.add(listener);
  return () => acknowledgmentListeners.delete(listener);
};
const getAcknowledged = () => JSON.stringify(acknowledged);
const requestsBridge: NotificationRequestsBridge = {
  async getApprovalEntries() {
    return approvalEntries;
  },
  async acknowledgeApprovalEntry(id) {
    acknowledged = [...acknowledged, id];
    approvalEntries = approvalEntries.filter((entry) => entry.id !== id);
    acknowledgmentListeners.forEach((listener) => listener());
  },
  onApprovalEntriesChanged(listener) {
    approvalListeners.add(listener);
    return () => approvalListeners.delete(listener);
  },
};

const pendingRequest: PendingRequest = {
  deviceId: "request-peer",
  deviceName: "Request Peer",
  requestVersion: "request-v1",
};
const unavailable = async (): Promise<never> => {
  throw new Error("Unexpected host effect in notification scenario");
};

function ScenarioControls({
  session,
  binding,
  setRequestsReady,
}: {
  session: ReturnType<typeof createUiSession>;
  binding: React.MutableRefObject<ReturnType<
    typeof bindNotificationRequests
  > | null>;
  setRequestsReady: React.Dispatch<boolean>;
}) {
  const acknowledgedText = React.useSyncExternalStore(
    subscribeAcknowledged,
    getAcknowledged,
    getAcknowledged
  );
  function select(id: string, requestId: string) {
    approvalEntries = [...approvalEntries, { id, requestId }];
    approvalListeners.forEach((listener) => listener());
  }
  function reset() {
    availability = {
      app: "blocked",
      channel: "blocked",
      displayError: null,
    };
    failNextAvailabilityRead = false;
    resolveSettingsAction?.();
    resolveSettingsAction = undefined;
    resolvePermission?.();
    resolvePermission = undefined;
    availabilityListeners.forEach((listener) => listener());
    session.close();
    session.update({ destination: "devices", settingsCategory: "general" });
    approvalEntries = [];
    acknowledged = [];
    acknowledgmentListeners.forEach((listener) => listener());
    setRequestsReady(false);
  }
  return (
    <aside aria-label="Scenario controls">
      <h1>Notification journey scenario</h1>
      <button
        type="button"
        onClick={() => select("notification-1", pendingRequest.deviceId)}
      >
        Select Request notification
      </button>
      <button
        type="button"
        onClick={() => select("notification-removed", "removed-peer")}
      >
        Select removed Request notification
      </button>
      <button type="button" onClick={() => setRequestsReady(true)}>
        Publish Requests ready
      </button>
      <button
        type="button"
        onClick={() => {
          failNextAvailabilityRead = true;
        }}
      >
        Fail next availability read
      </button>
      <button
        type="button"
        onClick={() => {
          availability = { ...availability, app: "available" };
          resolvePermission?.();
          resolvePermission = undefined;
          availabilityListeners.forEach((listener) => listener());
        }}
      >
        Resolve permission request
      </button>
      <button
        type="button"
        onClick={() => {
          resolveSettingsAction?.();
          resolveSettingsAction = undefined;
        }}
      >
        Resolve notification settings
      </button>
      <button type="button" onClick={() => void binding.current?.refresh()}>
        Refresh notification mailbox
      </button>
      <button type="button" onClick={reset}>
        Reset scenario
      </button>
      <output data-testid="acknowledged-notifications">
        {acknowledgedText}
      </output>
    </aside>
  );
}

function NotificationJourney() {
  const [session] = useState(() => {
    const created = createUiSession();
    created.update({ destination: "devices" });
    return created;
  });
  const [ready, setReadyState] = useState(false);
  const readyRef = useRef(false);
  const binding = useRef<ReturnType<typeof bindNotificationRequests> | null>(
    null
  );
  const notificationControls = useNotificationAvailability(availabilityBridge);
  const props: ClipboardAppProps = useMemo(
    () => ({
      clips: [],
      devices: [],
      pending: [pendingRequest],
      requestsLoading: !ready,
      requestsUnavailable: !ready,
      peers: [],
      identity: { deviceId: "scenario-device", deviceName: "Scenario Device" },
      pinnedIds: [],
      session,
      notificationControls,
      onDeleteClip: unavailable,
      onUnpair: unavailable,
      onAccept: unavailable,
      onReject: unavailable,
      onPairText: unavailable,
      onRequestPairingCode: unavailable,
      onCopyPairingText: unavailable,
      onReuseClip: unavailable,
      onShareNow: unavailable,
      onSetPinned: unavailable,
      onClearAll: unavailable,
    }),
    [
      ready,
      notificationControls.state,
      notificationControls.pending,
      notificationControls.error,
      session,
    ]
  );
  const [adapter] = useState(() => createUiRuntimeStore(props));
  useLayoutEffect(() => adapter.publish(props), [adapter, props]);

  function setRequestsReady(nextReady: boolean) {
    readyRef.current = nextReady;
    setReadyState(nextReady);
    adapter.publish({
      ...props,
      requestsLoading: !nextReady,
      requestsUnavailable: !nextReady,
    });
    void binding.current?.refresh();
  }

  useEffect(() => {
    const current = bindNotificationRequests(requestsBridge, session, () => ({
      ready: readyRef.current,
      clipIds: [],
      requestIds: readyRef.current ? [pendingRequest.deviceId] : [],
    }));
    binding.current = current;
    return () => {
      binding.current = null;
      current.dispose();
    };
  }, [session]);

  return (
    <ClipboardWorkspace
      adapter={adapter}
      session={session}
      pairingDiagnostics={
        <ScenarioControls
          session={session}
          binding={binding}
          setRequestsReady={setRequestsReady}
        />
      }
    />
  );
}

createRoot(document.getElementById("root")!).render(<NotificationJourney />);
