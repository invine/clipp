/// <reference types="chrome" />
import {
  createChromeManagement,
  MANAGEMENT_PORT,
  type Handoff,
} from "./chromeManagement";
const MAILBOX = "clippManagementNavigationV1";
/** Chrome 109 callback listeners; no credentials or task contents cross this boundary. */
export function installChromeManagement(
  api: typeof chrome,
  admission: { ready?: Promise<unknown>; available?(): boolean } = {}
) {
  const callback = <T>(invoke: (done: (value: T) => void) => void) =>
    new Promise<T>((resolve, reject) => {
      invoke((value) => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(value);
      });
    });
  // Explicitly restore the trusted-context boundary before reading any mailbox.
  const storageReady = callback<void>((done) =>
    api.storage.session.setAccessLevel(
      { accessLevel: "TRUSTED_CONTEXTS" },
      done
    )
  );
  // A worker can start before any document asks for management status.
  void storageReady.catch(() => {});
  const coordinator = createChromeManagement({
    extensionId: api.runtime.id,
    popupUrl: api.runtime.getURL("src/popup.html"),
    pageUrl: api.runtime.getURL("src/options.html"),
    read: async () => {
      await storageReady;
      const result = await callback<Record<string, unknown>>((done) =>
        api.storage.session.get(MAILBOX, done)
      );
      return (result[MAILBOX] ?? []) as Handoff[];
    },
    write: async (records) => {
      await storageReady;
      return callback<void>((done) =>
        api.storage.session.set({ [MAILBOX]: records }, done)
      );
    },
    create: () =>
      callback<chrome.tabs.Tab>((done) =>
        api.tabs.create(
          { url: api.runtime.getURL("src/options.html"), active: true },
          done
        )
      ),
    exists: async (id) => {
      try {
        const tab = await callback<chrome.tabs.Tab>((done) =>
          api.tabs.get(id, done)
        );
        return tab.url === api.runtime.getURL("src/options.html");
      } catch {
        return false;
      }
    },
    canonicalTabs: async () =>
      (
        await callback<chrome.tabs.Tab[]>((done) =>
          api.tabs.query({ url: api.runtime.getURL("src/options.html") }, done)
        )
      )
        .filter(
          (t) =>
            t.url === api.runtime.getURL("src/options.html") &&
            t.id !== undefined
        )
        .map((t) => t.id!),
    activate: async (id, windowId) => {
      const tab = await callback<chrome.tabs.Tab | undefined>((done) =>
        api.tabs.update(id, { active: true }, done)
      );
      if (!tab) throw new Error("tab_activation_unconfirmed");
      if (windowId !== undefined)
        await callback<chrome.windows.Window>((done) =>
          api.windows.update(windowId, { focused: true }, done)
        );
    },
    now: Date.now,
    available: admission.available,
    focusedWindow: () =>
      new Promise<number | undefined>((resolve) => {
        // A popup sender need not carry a tab. One bounded host lookup supplies
        // the window preference without accepting caller-provided tab identity.
        const timer = setTimeout(() => resolve(undefined), 500);
        try {
          api.windows.getLastFocused({ windowTypes: ["normal"] }, (window) => {
            clearTimeout(timer);
            const error = api.runtime.lastError;
            resolve(error ? undefined : window?.id);
          });
        } catch {
          clearTimeout(timer);
          resolve(undefined);
        }
      }),
  });
  api.runtime.onConnect.addListener((port) => {
    if (port.name === MANAGEMENT_PORT)
      coordinator.register({
        name: port.name,
        sender: port.sender,
        postMessage: (value) => port.postMessage(value),
        disconnect: () => port.disconnect(),
        onDisconnect: port.onDisconnect,
        onMessage: {
          addListener(listener) {
            // Install synchronously: a page may advertise readiness before startup settles.
            port.onMessage.addListener((value) => {
              void Promise.resolve(admission.ready).then(
                () => {
                  if (admission.available?.() === false) port.disconnect();
                  else listener(value);
                },
                () => port.disconnect()
              );
            });
          },
        },
      });
  });
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      ![
        "managementNavigate",
        "managementStatus",
        "managementRetry",
        "managementDismiss",
      ].includes(message?.type)
    )
      return;
    const action = Promise.resolve(admission.ready).then(() => {
      if (
        admission.available?.() === false &&
        message.type !== "managementStatus"
      )
        return { ok: false, error: "identity_runtime_suspended" };
      return message.type === "managementNavigate"
        ? coordinator.request(sender, message.handoff)
        : message.type === "managementStatus"
          ? coordinator.status(sender)
          : message.type === "managementRetry"
            ? coordinator.retry(sender, message.id)
            : coordinator.dismiss(sender, message.id);
    });
    void action.then(
      (result) => {
        try {
          sendResponse(result);
        } catch {
          // Ownership is already durable; a destroyed source cannot cancel routing.
        }
        if (
          message.type === "managementStatus" &&
          result.ok &&
          "records" in result
        )
          for (const record of result.records as Handoff[])
            if (record.status === "pending")
              void coordinator.route(record.id).catch(() => {});
        if (
          message.type === "managementNavigate" &&
          result.ok &&
          "id" in result
        )
          void coordinator.route(String(result.id)).catch(() => {});
      },
      () => {
        try {
          sendResponse({ ok: false, error: "management_storage_unavailable" });
        } catch {
          // A later trusted document can inspect the durable mailbox.
        }
      }
    );
    return true;
  });
  return coordinator;
}
