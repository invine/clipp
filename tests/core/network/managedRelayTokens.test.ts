import { parseManagedRelayTokenResponse } from "../../../packages/core/network/managedRelayTokens";

describe("managed relay token responses", () => {
  it("accepts opaque credentials and bearer type case-insensitively", () => {
    const response = {
      access_token: "ory_at_native.CaSeSensitive",
      refresh_token: "ory_rt_native.KeEpBytes",
      token_type: "bEaReR",
      expires_in: 900,
    };

    expect(parseManagedRelayTokenResponse(response)).toEqual(response);
  });

  it("rejects empty, oversized, malformed, or out-of-bounds responses", () => {
    const valid = {
      access_token: "opaque-access",
      refresh_token: "opaque-refresh",
      token_type: "Bearer",
      expires_in: 900,
    };
    const invalid = [
      null,
      undefined,
      {},
      { ...valid, access_token: "" },
      { ...valid, refresh_token: "" },
      { ...valid, token_type: "Basic" },
      { ...valid, expires_in: 0 },
      { ...valid, expires_in: 901 },
      { ...valid, expires_in: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, access_token: "a".repeat(16_385) },
    ];

    for (const candidate of invalid) {
      expect(() => parseManagedRelayTokenResponse(candidate)).toThrow(
        "invalid_token_response"
      );
    }
  });
});
