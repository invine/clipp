// Delivery v1 is pinned to macOS arm64. These CLI fixtures exercise the
// frozen run graph with stubbed native adapters on other CI hosts.
Object.defineProperty(process, "platform", { value: "darwin" });
Object.defineProperty(process, "arch", { value: "arm64" });
