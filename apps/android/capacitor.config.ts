import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.clipp.app",
  appName: "Clipp",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    url: process.env.VITE_DEV_SERVER_URL || "http://localhost:4174",
    cleartext: true,
  },
};

export default config;
