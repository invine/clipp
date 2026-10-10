export type NameEditSnapshot = Readonly<{
  targetId: string | null;
  raw: string;
  pending: boolean;
  error: string | null;
}>;

export function nameSaveErrorMessage(error: string, alias: boolean): string {
  if (
    error.includes("invalid_device_name") ||
    error.includes("invalid_device_alias")
  ) {
    return `${alias ? "Alias" : "Device Name"} must contain 1–64 characters without control or line breaks. Edit and Save again.`;
  }
  if (error.includes("device_unavailable")) {
    return "This device is no longer available. Your edit was not applied.";
  }
  if (
    error.includes("rename_outcome_unconfirmed") ||
    error.includes("rename_state_unconfirmed")
  ) {
    return "The Save result could not be confirmed. Check the current name before saving again.";
  }
  return `${alias ? "Alias" : "Device Name"} Save was not confirmed. Your edit is still here; check the current value before saving again.`;
}

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
