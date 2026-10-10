import { createPopupNameState } from "../../apps/extension/src/popupNameState";
import { createNameEditSession } from "../../packages/ui/src/nameEditSession";

type FixtureName = { deviceId: string; deviceName: string };

describe("Chrome popup authoritative names", () => {
  it("applies a published rename after a lost reply while retaining the raw edit", () => {
    let identity: { deviceId: string; deviceName: string } | null = null;
    let devices: Array<{ deviceId: string; deviceName: string }> = [];
    const edit = createNameEditSession();
    edit.begin("local", "Old");
    edit.change("Draft after lost reply");
    const state = createPopupNameState<FixtureName, FixtureName>(
      (value) => {
        identity = value;
      },
      (value) => {
        devices = value;
      }
    );
    const initialRead = state.revision();

    state.publish({
      identity: { deviceId: "local", deviceName: "Applied" },
      devices: [{ deviceId: "peer", deviceName: "Remote update" }],
    });
    state.readIdentity(initialRead, { deviceId: "local", deviceName: "Old" });
    state.readDevices(initialRead, [
      { deviceId: "peer", deviceName: "Old remote" },
    ]);

    expect(identity).toEqual({ deviceId: "local", deviceName: "Applied" });
    expect(devices).toEqual([
      { deviceId: "peer", deviceName: "Remote update" },
    ]);
    edit.authoritativeValue("local", identity!.deviceName);
    expect(edit.getSnapshot().raw).toBe("Draft after lost reply");
  });

  it("does not let a previous request overwrite a newer identity session", () => {
    let identity: { deviceId: string; deviceName: string } | null = null;
    const state = createPopupNameState<FixtureName, FixtureName>(
      (value) => {
        identity = value;
      },
      () => {}
    );
    const oldRead = state.revision();
    state.publish({
      identity: { deviceId: "rotated", deviceName: "New identity" },
      devices: [],
    });
    state.readIdentity(oldRead, {
      deviceId: "former",
      deviceName: "Former identity",
    });
    expect(identity).toEqual({
      deviceId: "rotated",
      deviceName: "New identity",
    });
  });
});
