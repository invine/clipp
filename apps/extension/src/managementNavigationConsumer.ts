/// <reference types="chrome" />
import type { Handoff } from "./chromeManagement";
import type { UiSession } from "../../../packages/ui/src/uiSession";
import type { UiDestination } from "../../../packages/ui/src/uiDestination";

const acceptanceUnconfirmed =
  "Navigation acceptance could not be confirmed. Open Clipp again to check this handoff.";

type Reply = {
  ok: boolean;
  records?: Handoff[];
  error?: string;
  status?: string;
};
function request(
  runtime: typeof chrome.runtime,
  message: unknown,
  receive: (response: Reply | undefined) => void
) {
  let finished = false;
  const timer = setTimeout(() => finish(undefined), 15000);
  const finish = (response: Reply | undefined) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    receive(response);
  };
  try {
    runtime.sendMessage(message, (response) => {
      // Chrome's lastError must be consumed in the callback, even after expiry.
      const error = runtime.lastError;
      finish(error ? undefined : response);
    });
  } catch {
    finish(undefined);
  }
  return () => {
    finished = true;
    clearTimeout(timer);
  };
}

export function navigateManagement(
  runtime: typeof chrome.runtime,
  id: string,
  destination: UiDestination
) {
  return new Promise<Reply>((resolve) => {
    request(
      runtime,
      { type: "managementNavigate", handoff: { id, destination } },
      (response) =>
        resolve(response ?? { ok: false, error: acceptanceUnconfirmed })
    );
  });
}

/** Document-lived presentation of the background's navigation mailbox. */
export function createManagementNavigationConsumer(
  runtime: typeof chrome.runtime,
  session: UiSession
) {
  let state: {
    records: Handoff[];
    statusError: boolean;
    error: string | null;
    pending: boolean;
    openUnconfirmed: boolean;
  } = {
    records: [],
    statusError: false,
    error: null,
    pending: false,
    openUnconfirmed: false,
  };
  let statusRead: { cancel(): void } | undefined;
  let action: { cancel(): void } | undefined;
  let active = false;
  // At most one uncertain source acceptance; it never enters persistent storage.
  let uncertainOpen: Handoff | undefined;
  const listeners = new Set<() => void>();
  const publish = (fields: Partial<typeof state>) => {
    state = { ...state, ...fields };
    listeners.forEach((listener) => listener());
  };
  const refresh = () => {
    if (!active || statusRead || state.pending) return;
    const read = { cancel: () => {} };
    statusRead = read;
    read.cancel = request(runtime, { type: "managementStatus" }, (response) => {
      if (statusRead !== read) return;
      statusRead = undefined;
      if (!response?.ok || !Array.isArray(response.records)) {
        publish({ statusError: true });
        return;
      }
      const records = response.records;
      const acceptanceConfirmed = records.some(
        (record) => record.id === uncertainOpen?.id
      );
      if (acceptanceConfirmed) uncertainOpen = undefined;
      publish({
        ...(acceptanceConfirmed ? { error: null } : {}),
        statusError: false,
        records: uncertainOpen ? [...records, uncertainOpen] : records,
        openUnconfirmed: !!uncertainOpen,
      });
    });
  };
  const perform = (
    message: unknown,
    result: (response: Reply | undefined) => void
  ) => {
    if (!active || state.pending) return;
    statusRead?.cancel();
    statusRead = undefined;
    const operation = { cancel: () => {} };
    action = operation;
    publish({ pending: true, error: null });
    operation.cancel = request(runtime, message, (response) => {
      if (action !== operation) return;
      action = undefined;
      publish({ pending: false });
      result(response);
      refresh();
    });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    open() {
      if (!active || state.pending || uncertainOpen) return;
      const current = session.destinationAvailability().current;
      const context = session.getSnapshot();
      const destination: UiDestination =
        current.kind === "history"
          ? {
              kind: "history",
              context: {
                search: context.search,
                timeFilter: context.timeFilter,
                sourceFilter: context.sourceFilter,
                filterMode: context.filterMode,
              },
            }
          : current;
      const id = crypto.randomUUID();
      perform(
        { type: "managementNavigate", handoff: { id, destination } },
        (response) => {
          if (!response?.ok) {
            if (
              ![
                "management_mailbox_full",
                "invalid_destination",
                "unauthorized_management",
                "identity_runtime_suspended",
              ].includes(response?.error ?? "")
            ) {
              uncertainOpen = {
                id,
                destination,
                status: "unconfirmed",
                createdAt: Date.now(),
                attempts: 0,
                error: acceptanceUnconfirmed,
              };
              publish({
                records: [...state.records, uncertainOpen],
                openUnconfirmed: true,
              });
            }
            publish({
              error:
                response?.error === "management_mailbox_full"
                  ? "Earlier navigation needs attention. Retry or dismiss its notices."
                  : response?.error === "invalid_destination"
                    ? "This destination cannot be opened. Return to History and try again."
                    : response?.error === "unauthorized_management"
                      ? "This page cannot request full-page navigation."
                      : response?.error === "identity_runtime_suspended"
                        ? "Clipp is not ready to navigate. Check its recovery status before trying again."
                        : acceptanceUnconfirmed,
            });
          }
        }
      );
    },
    act(type: "managementRetry" | "managementDismiss", id: string) {
      perform({ type, id }, (response) => {
        if (
          response?.ok &&
          type === "managementDismiss" &&
          uncertainOpen?.id === id
        ) {
          uncertainOpen = undefined;
          publish({
            records: state.records.filter((record) => record.id !== id),
            openUnconfirmed: false,
          });
        }
        publish({
          error: response?.ok
            ? null
            : "Navigation recovery could not be confirmed. Check this handoff again.",
        });
      });
    },
    start() {
      active = true;
      refresh();
      const timer = setInterval(refresh, 2000);
      return () => {
        active = false;
        clearInterval(timer);
        statusRead?.cancel();
        statusRead = undefined;
        action?.cancel();
        action = undefined;
      };
    },
  };
}
