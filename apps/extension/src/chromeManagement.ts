import { authorizedRelayUi } from "./managedRelayUi";
import {
  parseUiDestination,
  sameUiDestination,
  type UiDestination,
} from "../../../packages/ui/src/uiDestination";
export const MANAGEMENT_PORT = "clipp-management-page-v1";
export type Handoff = {
  id: string;
  destination: UiDestination;
  status: "pending" | "applied" | "failed" | "unconfirmed";
  createdAt: number;
  target?: number;
  windowId?: number;
  attempts: number;
  error?: string;
  creating?: boolean;
  beforeCreate?: number[];
  declined?: number[];
};
type Sender = {
  id?: string;
  url?: string;
  tab?: { id?: number; windowId?: number; url?: string };
  frameId?: number;
  documentId?: string;
};
export type ManagementPort = {
  name: string;
  sender?: Sender;
  postMessage(value: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (value: any) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
};
type Page = {
  port: ManagementPort;
  tab: number;
  windowId?: number;
  ready: boolean;
  idle: boolean;
  current?: UiDestination;
};
export function createChromeManagement(host: {
  extensionId: string;
  popupUrl: string;
  pageUrl: string;
  read(): Promise<Handoff[]>;
  write(records: Handoff[]): Promise<void>;
  create(): Promise<{ id?: number; windowId?: number }>;
  exists(id: number): Promise<boolean>;
  activate(id: number, windowId?: number): Promise<void>;
  now(): number;
  available?(): boolean;
  canonicalTabs?(): Promise<number[]>;
  focusedWindow?(): Promise<number | undefined>;
}) {
  let tail: Promise<unknown> = Promise.resolve();
  let invalidated = false;
  const pages = new Map<number, Page>();
  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => {});
    return next;
  };
  const trusted = (sender?: Sender) =>
    authorizedRelayUi(sender, host.extensionId, host.popupUrl, host.pageUrl) &&
    (sender?.frameId === undefined || sender.frameId === 0) &&
    (!sender?.tab || sender.tab.url === sender.url) &&
    (sender?.url !== host.pageUrl ||
      (sender.frameId === 0 &&
        Number.isInteger(sender.tab?.id) &&
        sender.tab!.id! >= 0));
  async function read() {
    const stored = await host.read();
    const records = stored.filter(
      (record) =>
        record.status !== "applied" ||
        record.error ||
        host.now() - record.createdAt < 300000
    );
    let changed = records.length !== stored.length;
    for (const record of records)
      if (
        record.status === "pending" &&
        host.now() - record.createdAt > 120000
      ) {
        record.status = "failed";
        record.error = "Navigation expired. Retry or dismiss this notice.";
        changed = true;
      }
    if (changed) await host.write(records);
    return records;
  }
  async function routeRecord(id: string) {
    if (invalidated || host.available?.() === false) return;
    const records = await read();
    const record = records.find((r) => r.id === id);
    if (!record || record.status !== "pending") return;
    if (record.target !== undefined && !(await host.exists(record.target))) {
      record.target = undefined;
      record.creating = false;
    }
    if (record.creating && record.target === undefined) {
      const tabs = (await host.canonicalTabs?.()) ?? [];
      const added = tabs.filter((tab) => !record.beforeCreate?.includes(tab));
      if (added.length === 1) {
        record.target = added[0];
        record.creating = false;
        await host.write(records);
      } else if (added.length === 0 && host.canonicalTabs) {
        record.creating = false;
        await host.write(records);
      } else {
        record.status = "unconfirmed";
        record.error =
          "Tab creation could not be confirmed. Retry to reconcile this handoff.";
        await host.write(records);
        return;
      }
    }
    let page =
      record.target === undefined ? undefined : pages.get(record.target);
    if (record.target === undefined) {
      const reserved = new Set(
        records
          .filter((r) => r.id !== id && r.status === "pending")
          .map((r) => r.target)
      );
      const suitable = [...pages.values()].filter(
        (p) =>
          p.ready &&
          !reserved.has(p.tab) &&
          !record.declined?.includes(p.tab) &&
          (p.idle ||
            (p.current && sameUiDestination(p.current, record.destination)))
      );
      suitable.sort(
        (a, b) =>
          Number(b.windowId === record.windowId) -
          Number(a.windowId === record.windowId)
      );
      page = suitable[0];
      if (page) {
        record.target = page.tab;
        record.windowId = page.windowId;
      } else {
        if (record.attempts >= 3) {
          record.status = "failed";
          record.error =
            "Navigation could not find a usable page. Retry or dismiss.";
          await host.write(records);
          return;
        }
        record.creating = true;
        record.attempts++;
        record.beforeCreate = (await host.canonicalTabs?.()) ?? [];
        await host.write(records);
        try {
          const tab = await host.create();
          if (tab.id === undefined) throw new Error("tab_creation_unconfirmed");
          record.target = tab.id;
          record.windowId = tab.windowId;
          record.creating = false;
        } catch {
          record.status = "unconfirmed";
          record.error =
            "Tab creation could not be confirmed. Retry to reconcile this handoff.";
        }
      }
      await host.write(records);
    }
    if (!page?.ready || record.status !== "pending") return;
    try {
      page.port.postMessage({ type: "destination", handoff: record });
    } catch {
      record.status = "unconfirmed";
      record.error =
        "Page delivery could not be confirmed. Retry to reconcile this handoff.";
      await host.write(records);
    }
  }
  const coordinator = {
    flush: () => tail,
    invalidate() {
      // Admission closes synchronously, before queued navigation can run again.
      invalidated = true;
      return serialized(async () => {
        try {
          await host.write([]);
          if ((await host.read()).length !== 0)
            throw new Error("management_reset_cleanup_unconfirmed");
        } finally {
          for (const page of pages.values()) {
            try {
              page.port.postMessage({ type: "identity-reset" });
            } catch {
              // Reconnection must revalidate identity and authoritative state.
            }
          }
        }
      });
    },
    route: (id: string) => serialized(() => routeRecord(id)),
    register(port: ManagementPort) {
      const sender = port.sender,
        tab = sender?.tab;
      if (
        invalidated ||
        port.name !== MANAGEMENT_PORT ||
        sender?.id !== host.extensionId ||
        sender.url !== host.pageUrl ||
        tab?.id === undefined ||
        !Number.isInteger(tab.id) ||
        tab.id < 0 ||
        tab.url !== host.pageUrl ||
        sender.frameId !== 0
      ) {
        port.disconnect();
        return;
      }
      const page: Page = {
        port,
        tab: tab.id,
        windowId: tab.windowId,
        ready: false,
        idle: false,
      };
      pages.set(page.tab, page);
      port.onDisconnect.addListener(() => {
        if (pages.get(page.tab) === page) pages.delete(page.tab);
      });
      port.onMessage.addListener((value) => {
        if (pages.get(page.tab) !== page || !value || typeof value !== "object")
          return;
        void serialized(async () => {
          if (pages.get(page.tab) !== page) return;
          if (value.type === "ready" && typeof value.idle === "boolean") {
            page.ready = value.ready !== false;
            page.idle = value.idle;
            page.current = parseUiDestination(value.current) ?? undefined;
            for (const record of await read())
              if (record.status === "pending") await routeRecord(record.id);
          } else if (
            value.type === "ack" &&
            typeof value.id === "string" &&
            ["applied", "declined", "unavailable"].includes(value.status)
          ) {
            const records = await read();
            const record = records.find(
              (r) =>
                r.id === value.id &&
                r.target === page.tab &&
                r.status === "pending"
            );
            if (!record) return;
            if (value.status === "declined") {
              record.declined = [...(record.declined ?? []), page.tab];
              record.target = undefined;
              page.idle = false;
              await host.write(records);
              await routeRecord(record.id);
            } else {
              record.status = "applied";
              record.error =
                value.status === "unavailable"
                  ? "The destination is no longer available. Open History or Requests."
                  : undefined;
              await host.write(records);
              try {
                await host.activate(page.tab, page.windowId);
              } catch {
                record.error =
                  "The destination opened, but its window could not be activated.";
                await host.write(records);
              }
            }
          }
        }).catch(() => {});
      });
    },
    status(sender: Sender | undefined) {
      if (!trusted(sender))
        return Promise.resolve({ ok: false, records: [] as Handoff[] });
      return serialized(async () => ({ ok: true, records: await read() }));
    },
    retry(sender: Sender | undefined, id: string) {
      if (!trusted(sender)) return Promise.resolve({ ok: false });
      return serialized(async () => {
        const records = await read(),
          record = records.find((r) => r.id === id);
        if (!record) return { ok: false };
        if (record.status === "applied") {
          if (record.target !== undefined) {
            try {
              await host.activate(record.target, record.windowId);
              if (
                record.error ===
                "The destination opened, but its window could not be activated."
              ) {
                record.error = undefined;
                await host.write(records);
              }
            } catch {
              return { ok: false, error: "management_activation_unconfirmed" };
            }
          }
          return { ok: true };
        }
        record.status = "pending";
        record.error = undefined;
        record.createdAt = host.now();
        record.attempts = 0;
        record.declined = [];
        // Preserve target/creation evidence: reconciliation always precedes another create.
        await host.write(records);
        await routeRecord(id);
        return { ok: true };
      });
    },
    dismiss(sender: Sender | undefined, id: string) {
      if (!trusted(sender)) return Promise.resolve({ ok: false });
      return serialized(async () => {
        await host.write(
          (await read()).filter((r) => r.id !== id || r.status === "pending")
        );
        return { ok: true };
      });
    },
    async request(sender: Sender | undefined, value: unknown) {
      if (!trusted(sender))
        return { ok: false, error: "unauthorized_management" };
      let windowId = sender?.tab?.windowId;
      if (windowId === undefined && sender?.url === host.popupUrl) {
        try {
          windowId = await host.focusedWindow?.();
        } catch {
          // Window selection is a preference; durable navigation still works without it.
        }
      }
      return this.accept(value, windowId);
    },
    accept(value: unknown, windowId?: number) {
      return serialized(async () => {
        if (invalidated || host.available?.() === false)
          return { ok: false, error: "identity_runtime_suspended" };
        const v = value as { id?: unknown; destination?: unknown };
        const destination = parseUiDestination(v?.destination);
        if (
          !destination ||
          typeof v.id !== "string" ||
          !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id) ||
          Object.keys(v).some((k) => !["id", "destination"].includes(k))
        )
          return { ok: false, error: "invalid_destination" };
        const records = await read();
        const existing = records.find((r) => r.id === v.id);
        if (existing)
          return JSON.stringify(existing.destination) ===
            JSON.stringify(destination)
            ? { ok: true, id: existing.id, status: existing.status }
            : { ok: false, error: "handoff_id_conflict" };
        if (records.length >= 32)
          return { ok: false, error: "management_mailbox_full" };
        const record: Handoff = {
          id: v.id,
          destination,
          status: "pending",
          createdAt: host.now(),
          attempts: 0,
          windowId,
        };
        await host.write([...records, record]);
        const confirmed = await host.read();
        if (
          !confirmed.some(
            (value) =>
              value.id === record.id &&
              JSON.stringify(value.destination) ===
                JSON.stringify(record.destination)
          )
        )
          throw new Error("management_acceptance_unconfirmed");
        return { ok: true, id: record.id, status: record.status };
      });
    },
  };
  return coordinator;
}
