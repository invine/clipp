// Installed only after native-only observations. IPC responses are UI fixtures.
module.exports = function ({ BrowserWindow, ipcMain }, state) {
  const w = BrowserWindow.getAllWindows()[0];
  globalThis.__uxState = state;
  globalThis.__uxCalls = [];
  globalThis.__uxFailures = {};
  const original = w.webContents.send.bind(w.webContents);
  w.webContents.send = (channel, ...args) =>
    original(
      channel,
      ...(channel === "clipp:update" ? [globalThis.__uxState] : args)
    );
  const publish = () => original("clipp:update", globalThis.__uxState);
  const install = (name, fn) => {
    ipcMain.removeHandler("clipp:" + name);
    ipcMain.handle("clipp:" + name, async (_, arg) => {
      globalThis.__uxCalls.push({ name, arg });
      if (globalThis.__uxFailures[name])
        throw Error(globalThis.__uxFailures[name]);
      const result = await fn(arg);
      publish();
      return result;
    });
  };
  install("get-state", () => globalThis.__uxState);
  install("delete-clip", (id) => {
    globalThis.__uxState.clips = globalThis.__uxState.clips.filter(
      (c) => c.id !== id
    );
  });
  install("clear-history", () => {
    globalThis.__uxState.clips = [];
  });
  install("set-pinned", ({ id, pinned }) => {
    globalThis.__uxState.pinnedIds = globalThis.__uxState.pinnedIds.filter(
      (x) => x !== id
    );
    if (pinned) globalThis.__uxState.pinnedIds.push(id);
  });
  install("reuse-clip", () => ({ outcome: "complete" }));
  install("share-now", () => {});
  install("set-auto-sync", (enabled) => {
    globalThis.__uxState.autoSync = enabled;
  });
  install("rename-identity", (name) => {
    globalThis.__uxState.identity.deviceName = name;
  });
  install("rename-device", ({ id, name }) => {
    globalThis.__uxState.devices.find((x) => x.deviceId === id).localAlias =
      name;
  });
  install("set-local-retention", (ms) => {
    globalThis.__uxState.localRetentionMs = ms;
  });
  install("set-managed-relays", (configs) => {
    globalThis.__uxState.managedRelayConfigurations = configs;
  });
  for (const name of [
    "managed-relay-login",
    "managed-relay-account",
    "managed-relay-retry",
    "respond-trust",
    "unpair-device",
    "pair-text",
    "retry-history-cleanup",
    "acknowledge-identity-rotation-notice",
    "dismiss-clipboard-history-error",
  ])
    install(name, () => ({ ok: true }));
  publish();
  return true;
};
