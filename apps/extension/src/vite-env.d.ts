interface ImportMetaEnv {
  readonly VITE_CLIPP_REGISTERED_EXTENSION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __CLIPP_RELAY_ACCEPTANCE_TRANSPORT__:
  "wss" | "webrtc-direct" | null;
