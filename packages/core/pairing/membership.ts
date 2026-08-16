export type DevicePresentation = { deviceName: string; nameRevision: bigint };
export type MembershipStatus = "active" | "revoked" | "unknown";
export type AdmissionResult = "admitted" | "already-active" | "revoked";

/** The Pairing port that can inspect and durably grant Device Membership. */
export type DeviceMembershipAdmissions = {
  membershipStatus(peerId: string): Promise<MembershipStatus>;
  admit(peerId: string, presentation?: DevicePresentation): Promise<AdmissionResult>;
};
