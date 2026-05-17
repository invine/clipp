import { CapacitorConfig } from "@capacitor/cli";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.clipp.app",
  appName: "Clipp",
  webDir: "dist",
  bundledWebRuntime: false,
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
