export type IdentityRotationNoticeReason = "revoked" | "identity-loss";

export function identityRotationNoticeMessage(reason: IdentityRotationNoticeReason): string {
  const event = reason === "revoked" ? "revoked" : "reset";
  return `This installation's former identity was ${event}. Previous Clipboard History was deleted and devices must be paired again.`;
}
