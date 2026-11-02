import type { Device, Identity } from "../../../packages/ui/src/types";

type RenameRuntime = {
  readonly lastError?: { message?: string };
  sendMessage(message: object, callback: (response?: unknown) => void): void;
};

function sendRename<Result>(
  runtime: RenameRuntime,
  message: object,
  value: "device" | "identity"
): Promise<Result> {
  return new Promise((resolve, reject) => {
    runtime.sendMessage(message, (response) => {
      if (runtime.lastError || !response) {
        reject(new Error("rename_outcome_unconfirmed"));
        return;
      }
      const result = response as {
        ok?: boolean;
        error?: string;
        device?: Device | null;
        identity?: Identity | null;
      };
      if (!result.ok || !result[value]) {
        reject(new Error(result.error || "rename_failed"));
        return;
      }
      resolve(result[value] as Result);
    });
  });
}

export function renameExtensionIdentity(
  runtime: RenameRuntime,
  name: string,
  expectedDeviceId: string
): Promise<Identity> {
  return sendRename(
    runtime,
    { type: "renameLocalIdentity", name, expectedDeviceId },
    "identity"
  );
}

export function renameExtensionDevice(
  runtime: RenameRuntime,
  id: string,
  name: string
): Promise<Device> {
  return sendRename(runtime, { type: "renameDevice", id, name }, "device");
}
