export type DevicePresentation = { deviceName: string; nameRevision: bigint };

/** The Pairing port that can inspect and durably grant Device Membership. */
export type DeviceMembershipAdmissions = {
  membershipStatus(peerId: string): Promise<"active" | "revoked" | "unknown">;
  admit(peerId: string, presentation?: DevicePresentation): Promise<"admitted" | "already-active" | "revoked">;
};
