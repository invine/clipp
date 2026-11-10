import { prepareInstalledDeliveryProbe } from "./installedDeliveryProbe.js";
import * as log from "../../../packages/core/logger.js";

prepareInstalledDeliveryProbe();
void import("./electronRuntime.js")
  .then(({ startElectronRuntime }) => startElectronRuntime())
  .then((owner) => owner.ready)
  .catch((error) => {
    (log as any).error?.("Clipp bootstrap failed", {
      error: (error as Error).message,
    });
  });
