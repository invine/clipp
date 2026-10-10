export type NameEditSnapshot = Readonly<{
  targetId: string | null;
  raw: string;
  pending: boolean;
  error: string | null;
}>;

export function createNameEditSession() {
  let snapshot: NameEditSnapshot = {
    targetId: null,
    raw: "",
    pending: false,
    error: null,
  };
  let base = "";
  let version = 0;
  const listeners = new Set<() => void>();

  function publish(next: NameEditSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function cancel() {
    version += 1;
    base = "";
    publish({ targetId: null, raw: "", pending: false, error: null });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    begin(targetId: string, value: string) {
      version += 1;
      base = value;
      publish({ targetId, raw: value, pending: false, error: null });
    },
    change(raw: string) {
      if (!snapshot.targetId) return;
      version += 1;
      publish({ ...snapshot, raw, error: null });
    },
    authoritativeValue(targetId: string, value: string) {
      if (snapshot.targetId !== targetId) return;
      if (snapshot.raw === base && !snapshot.pending) {
        publish({ ...snapshot, raw: value });
      }
      base = value;
    },
    cancel,
    removeTarget(targetId: string) {
      if (snapshot.targetId === targetId) cancel();
    },
    async save<Result extends { deviceId: string }>(
      action: (targetId: string, raw: string) => Promise<Result | null>
    ): Promise<void> {
      if (!snapshot.targetId || snapshot.pending) return;
      const targetId = snapshot.targetId;
      const raw = snapshot.raw;
      const submittedVersion = version;
      publish({ ...snapshot, pending: true, error: null });
      try {
        const result = await action(targetId, raw);
        if (snapshot.targetId !== targetId) return;
        if (!result || result.deviceId !== targetId) {
          throw new Error("device_unavailable");
        }
        if (version === submittedVersion) {
          cancel();
        } else {
          publish({ ...snapshot, pending: false });
        }
      } catch (error) {
        if (snapshot.targetId !== targetId) return;
        publish({
          ...snapshot,
          pending: false,
          error: error instanceof Error ? error.message : "name_save_failed",
        });
      }
    },
  };
}
