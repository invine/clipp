import { startElectronRuntime } from "./electronRuntime.js";
import * as log from "../../../packages/core/logger.js";

void startElectronRuntime()
  .then((owner) => owner.ready)
  .catch((error) => {
    (log as any).error?.("Clipp bootstrap failed", {
      error: (error as Error).message,
    });
  });
