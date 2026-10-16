import { CapacitorConfig } from "@capacitor/cli";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.clipp.app",
  appName: "Clipp",
  webDir: "dist",
  bundledWebRuntime: false,
  // Native plugin payloads include private identity/reset persistence values.
  loggingBehavior: "none",
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: true,
        },
      }
    : {}),
};

export default config;
