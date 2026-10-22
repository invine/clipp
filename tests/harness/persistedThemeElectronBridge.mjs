// Serialized into the controlled renderer fixture; no native event/permission source.
export function createControlledElectronStartupBridge({ request, subscribe }) {
  const readyOwners = new Set();
  const on =
    (type, select = () => undefined) =>
    (listener) =>
      subscribe((message) => {
        if (message?.type === type) listener(select(message));
      });
  return {
    setSettings: (settings) => request({ type: "setSettings", settings }),
    onTaskActivation: on("taskActivation"),
    onApprovalEntriesChanged: on("approvalEntriesChanged"),
    getApprovalEntries: async () => [],
    async acknowledgeApprovalEntry() {
      throw new Error("fixture_has_no_approval_entries");
    },
    getNotificationAvailability: async () => ({
      app: "unsupported",
      channel: "not-applicable",
      displayError: null,
    }),
    onNotificationAvailabilityChanged: on("notificationAvailabilityChanged"),
    onUpdate: on("runtimeState", (message) => message.state),
    onLog: on("runtimeLog", (message) => message.payload),
    async setTaskInputReady(owner, ready) {
      if (typeof owner !== "string" || !owner || typeof ready !== "boolean")
        throw new Error("invalid_fixture_readiness");
      if (ready) readyOwners.add(owner);
      else readyOwners.delete(owner);
      // Registration only: no host activation is generated or qualified.
    },
  };
}
