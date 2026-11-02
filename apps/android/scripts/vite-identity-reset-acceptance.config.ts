import { mergeConfig } from "vite";
import path from "node:path";
import base from "../vite.config";

export default mergeConfig(base, {
  root: path.resolve(__dirname, "../../../tests/android/native-reset"),
  build: {
    outDir: path.resolve(
      __dirname,
      "../android/app/build/generated/identityResetAcceptanceAssets/identity-reset-acceptance"
    ),
    emptyOutDir: true,
  },
});
