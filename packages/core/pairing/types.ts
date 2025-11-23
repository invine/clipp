import type { QRPayload } from "../qr";

export type PairingPayload = QRPayload;

export const PAIRING_VERSION = "1";
export const PAIRING_MAX_SKEW_SECONDS = 300;
