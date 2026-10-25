export type ManagedRelayTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

const maxTokenLength = 16_384;
const maxAccessLifetimeSeconds = 900;

/** Validate the public relay token response while keeping token values opaque. */
export function parseManagedRelayTokenResponse(
  value: unknown
): ManagedRelayTokenResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_token_response");
  }

  const token = value as Record<string, unknown>;
  if (
    typeof token.access_token !== "string" ||
    token.access_token.length === 0 ||
    token.access_token.length > maxTokenLength ||
    typeof token.refresh_token !== "string" ||
    token.refresh_token.length === 0 ||
    token.refresh_token.length > maxTokenLength ||
    typeof token.token_type !== "string" ||
    token.token_type.toLowerCase() !== "bearer" ||
    !Number.isSafeInteger(token.expires_in) ||
    (token.expires_in as number) < 1 ||
    (token.expires_in as number) > maxAccessLifetimeSeconds
  ) {
    throw new Error("invalid_token_response");
  }

  return token as ManagedRelayTokenResponse;
}
