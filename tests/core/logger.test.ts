import * as log from "../../packages/core/logger";

describe("privacy-safe logging", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    log.setLogLevel("debug");
  });

  it("redacts sensitive fields, summarizes binary data, and bounds presentation metadata", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const deviceName = `attacker-${"x".repeat(1_000)}`;

    log.warn("rejected message", {
      peerId: "peer-1",
      privateKey: "PRIVATE_KEY_SECRET",
      clip: { content: "CLIP_CONTENT_SECRET", type: "text" },
      requestEnvelope: new TextEncoder().encode("RAW_PAIRING_ENVELOPE_SECRET"),
      signature: new TextEncoder().encode("SIGNATURE_SECRET"),
      deviceName,
    });

    expect(warn).toHaveBeenCalledWith("rejected message", {
      peerId: "peer-1",
      privateKey: "[REDACTED]",
      clip: { content: "[REDACTED]", type: "text" },
      requestEnvelope: "[binary 27 bytes]",
      signature: "[binary 16 bytes]",
      deviceName: `${deviceName.slice(0, 256)}…[truncated]`,
    });
    const output = JSON.stringify(warn.mock.calls);
    expect(output).not.toContain("PRIVATE_KEY_SECRET");
    expect(output).not.toContain("CLIP_CONTENT_SECRET");
    expect(output).not.toContain("RAW_PAIRING_ENVELOPE_SECRET");
    expect(output).not.toContain("SIGNATURE_SECRET");
  });
});
