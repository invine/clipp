import { postManagedRelayToken } from "../../apps/extension/src/managedRelayTokenHttp";

describe("Chrome relay token exchange", () => {
  it("accepts a bounded token response", async () => {
    const response = new Response(
      JSON.stringify({
        access_token: "short",
        refresh_token: "renewable",
        token_type: "Bearer",
        expires_in: 900,
      }),
      { status: 200 }
    );
    await expect(
      postManagedRelayToken(
        "https://relay.example/oauth/token",
        new URLSearchParams({ grant_type: "authorization_code" }),
        {
          fetch: async () => response,
        }
      )
    ).resolves.toEqual({
      access_token: "short",
      refresh_token: "renewable",
      token_type: "Bearer",
      expires_in: 900,
    });
  });

  it("aborts and settles a hung exchange within the deadline", async () => {
    let aborted = false;
    const pending = postManagedRelayToken(
      "https://relay.example/oauth/token",
      new URLSearchParams({ grant_type: "refresh_token" }),
      {
        timeoutMs: 5,
        fetch: async (_url, init) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
          });
          return await new Promise<Response>(() => undefined);
        },
      }
    );
    await expect(pending).rejects.toThrow(/timeout/);
    expect(aborted).toBe(true);
  });

  it("rejects oversized token responses", async () => {
    const response = new Response(
      JSON.stringify({ access_token: "x".repeat(20_000) }),
      { status: 200 }
    );
    await expect(
      postManagedRelayToken(
        "https://relay.example/oauth/token",
        new URLSearchParams(),
        {
          fetch: async () => response,
        }
      )
    ).rejects.toThrow(/too_large/);
  });
});
