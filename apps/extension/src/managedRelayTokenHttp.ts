type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

const MAX_TOKEN_RESPONSE_BYTES = 16_384;

export async function postManagedRelayToken(
  url: string,
  form: URLSearchParams,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {}
): Promise<TokenResponse> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10_000;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("relay_token_timeout"));
    }, timeoutMs);
  });
  const request = (async () => {
    const response = await (options.fetch ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        response.status === 400 || response.status === 401
          ? "relay_login_needed"
          : "relay_token_unavailable"
      );
    const contentLength = Number(response.headers.get("Content-Length"));
    if (contentLength > MAX_TOKEN_RESPONSE_BYTES)
      throw new Error("relay_token_response_too_large");
    if (!response.body) throw new Error("relay_token_response_missing_body");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      let reading = true;
      while (reading) {
        const part = await reader.read();
        if (part.done) {
          reading = false;
          continue;
        }
        length += part.value.byteLength;
        if (length > MAX_TOKEN_RESPONSE_BYTES)
          throw new Error("relay_token_response_too_large");
        chunks.push(part.value);
      }
    } finally {
      if (length > MAX_TOKEN_RESPONSE_BYTES)
        await reader.cancel().catch(() => undefined);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    ) as TokenResponse;
  })();
  try {
    return await Promise.race([request, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
  }
}
