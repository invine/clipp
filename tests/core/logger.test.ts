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
      binary: new Uint8Array(4),
      deviceName,
    });

    expect(warn).toHaveBeenCalledWith("rejected message", {
      peerId: "[REDACTED]",
      privateKey: "[REDACTED]",
      clip: { content: "[REDACTED]", type: "text" },
      requestEnvelope: "[REDACTED]",
      signature: "[REDACTED]",
      binary: "[binary 4 bytes]",
      deviceName: "[REDACTED]",
    });
    const output = JSON.stringify(warn.mock.calls);
    expect(output).not.toContain("PRIVATE_KEY_SECRET");
    expect(output).not.toContain("CLIP_CONTENT_SECRET");
    expect(output).not.toContain("RAW_PAIRING_ENVELOPE_SECRET");
    expect(output).not.toContain("SIGNATURE_SECRET");
    expect(output).not.toContain("peer-1");
    expect(output).not.toContain(deviceName);
  });

  it("never emits free-form detail strings or error messages", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const secret = "peer-12D3KooW-on-/ip4/192.0.2.1/tcp/4001";

    log.warn("Network operation failed", secret, new Error(secret), {
      error: secret,
      message: secret,
      nested: { stack: secret },
    });

    expect(warn).toHaveBeenCalledWith(
      "Network operation failed",
      "[REDACTED]",
      { name: "Error", message: "[REDACTED]" },
      {
        error: "[REDACTED]",
        message: "[REDACTED]",
        nested: { stack: "[REDACTED]" },
      },
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
  });

  it("preserves allowlisted failure reasons without exposing error text", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const eof = new Error("SECRET transport address and key");
    eof.name = "UnexpectedEOFError";

    log.error("Offscreen handler error", {
      action: "runtimeSend",
      failure: eof,
    });
    log.error("Offscreen handler error", {
      action: "runtimeSendStream",
      failure: new Error("peer_not_connected"),
    });
    log.error("Offscreen handler error", {
      failure: new Error("peer_not_connected SECRET"),
    });

    expect(error.mock.calls[0][1]).toEqual({
      action: "runtimeSend",
      failure: {
        name: "UnexpectedEOFError",
        message: "[REDACTED]",
        reason: "unexpected_eof",
      },
    });
    expect(error.mock.calls[1][1]).toEqual({
      action: "runtimeSendStream",
      failure: {
        name: "Error",
        message: "[REDACTED]",
        reason: "peer_not_connected",
      },
    });
    expect(error.mock.calls[2][1]).toEqual({
      failure: { name: "Error", message: "[REDACTED]" },
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET");
  });
});
