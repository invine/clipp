/// <reference types="chrome" />
import {
  createChromeManagement,
  MANAGEMENT_PORT,
  type Handoff,
} from "./chromeManagement";
const MAILBOX = "clippManagementNavigationV1";
/** Chrome 109 callback listeners; no credentials or task contents cross this boundary. */
export function installChromeManagement(api: typeof chrome) {
  const callback = <T>(invoke: (done: (value: T) => void) => void) =>
    new Promise<T>((resolve, reject) => {
      invoke((value) => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(value);
      });
    });
  const coordinator = createChromeManagement({
    extensionId: api.runtime.id,
    popupUrl: api.runtime.getURL("src/popup.html"),
    pageUrl: api.runtime.getURL("src/options.html"),
    read: async () => {
      const result = await callback<Record<string, unknown>>((done) =>
        api.storage.session.get(MAILBOX, done)
      );
      return (result[MAILBOX] ?? []) as Handoff[];
    },
    write: (records) =>
      callback<void>((done) =>
        api.storage.session.set({ [MAILBOX]: records }, done)
      ),
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
  });
  api.runtime.onConnect.addListener((port) => {
    if (port.name === MANAGEMENT_PORT) coordinator.register(port);
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
    const action =
      message.type === "managementNavigate"
        ? coordinator.request(sender, message.handoff)
        : message.type === "managementStatus"
          ? coordinator.status(sender)
          : message.type === "managementRetry"
            ? coordinator.retry(sender, message.id)
            : coordinator.dismiss(sender, message.id);
    void action.then(
      (result) => {
        sendResponse(result);
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
      () => sendResponse({ ok: false, error: "management_storage_unavailable" })
    );
    return true;
  });
  return coordinator;
}
