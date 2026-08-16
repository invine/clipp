export type PairingMembership = {
  membershipStatus(peerId: string): Promise<"active" | "revoked" | "unknown">;
  admit(peerId: string): Promise<"admitted" | "already-active" | "revoked">;
};
