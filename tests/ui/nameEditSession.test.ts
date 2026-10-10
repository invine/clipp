import {
  createNameEditSession,
  nameSaveErrorMessage,
} from "../../packages/ui/src/nameEditSession";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("Device Name and Local Device Alias draft session", () => {
  it("shows validation recovery for Electron IPC-wrapped name and alias failures", () => {
    expect(
      nameSaveErrorMessage(
        "Error invoking remote method 'clipp:rename-identity': Error: invalid_device_name",
        false
      )
    ).toMatch(/Device Name must contain 1–64 characters/);
    expect(
      nameSaveErrorMessage(
        "Error invoking remote method 'clipp:rename-device': Error: invalid_device_alias",
        true
      )
    ).toMatch(/Alias must contain 1–64 characters/);
  });
  it("retains the raw invalid input and reports the failure", async () => {
    const edit = createNameEditSession();
    edit.begin("local", "Desktop");
    edit.change("  \n  ");

    await edit.save(async () => {
      throw new Error("invalid_device_name");
    });

    expect(edit.getSnapshot()).toMatchObject({
      targetId: "local",
      raw: "  \n  ",
      pending: false,
      error: "invalid_device_name",
    });
  });

  it("prevents duplicate Save while allowing new typing after Save", async () => {
    const edit = createNameEditSession();
    const result = deferred<{ deviceId: string }>();
    const action = jest.fn(() => result.promise);
    edit.begin("peer-a", "Old alias");
    edit.change("New alias");
    const saving = edit.save(action);
    void edit.save(action);
    edit.change("Newest alias");
    result.resolve({ deviceId: "peer-a" });
    await saving;

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith("peer-a", "New alias");
    expect(edit.getSnapshot()).toMatchObject({
      targetId: "peer-a",
      raw: "Newest alias",
      pending: false,
      error: null,
    });
  });

  it("drops a removed target and ignores its late result", async () => {
    const edit = createNameEditSession();
    const result = deferred<{ deviceId: string }>();
    edit.begin("peer-a", "Old alias");
    edit.change("New alias");
    const saving = edit.save(() => result.promise);
    edit.removeTarget("peer-a");
    result.resolve({ deviceId: "peer-a" });
    await saving;

    expect(edit.getSnapshot().targetId).toBeNull();
  });

  it("keeps a dirty draft through an external same-field update", () => {
    const edit = createNameEditSession();
    edit.begin("local", "Desktop");
    edit.change("My desk");
    edit.authoritativeValue("local", "Other desk");
    expect(edit.getSnapshot().raw).toBe("My desk");
  });
});
