import {
  createNameEditSession,
  nameSaveErrorMessage,
  saveNonEmptyAlias,
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
  it("retains failed input on Close and reopens it over a newer applied name", async () => {
    const edit = createNameEditSession();
    edit.begin("peer-a", "Old alias");
    edit.change("My alias");
    await edit.save(async () => {
      throw new Error("storage_unavailable");
    });
    edit.dismiss();
    expect(edit.getSnapshot().active).toBe(false);
    edit.begin("peer-a", "Externally updated alias");
    expect(edit.getSnapshot()).toMatchObject({
      active: true,
      raw: "My alias",
      error: "storage_unavailable",
    });
    edit.cancel();
    edit.begin("peer-a", "Externally updated alias");
    expect(edit.getSnapshot().raw).toBe("Externally updated alias");
  });

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

  it("does not let a blank alias Save invoke the clear action", async () => {
    const edit = createNameEditSession();
    const action = jest.fn(async () => ({ deviceId: "peer-a" }));
    edit.begin("peer-a", "Old alias");
    edit.change("   ");

    await saveNonEmptyAlias(edit, action);

    expect(action).not.toHaveBeenCalled();
    expect(edit.getSnapshot()).toMatchObject({
      targetId: "peer-a",
      raw: "   ",
      pending: false,
      error: "invalid_device_alias",
    });
  });

  it.each(["resolve", "reject"])(
    "ignores an old %s after cancel and reopen of the same target",
    async (outcome) => {
      const edit = createNameEditSession();
      const old = deferred<{ deviceId: string }>();
      const current = deferred<{ deviceId: string }>();
      edit.begin("peer-a", "First");
      const oldSave = edit.save(() => old.promise);
      edit.cancel();
      edit.begin("peer-a", "Second");
      const currentSave = edit.save(() => current.promise);

      if (outcome === "resolve") old.resolve({ deviceId: "peer-a" });
      else old.reject(new Error("old_failure"));
      await oldSave;

      expect(edit.getSnapshot()).toMatchObject({
        targetId: "peer-a",
        raw: "Second",
        pending: true,
        error: null,
      });
      current.resolve({ deviceId: "peer-a" });
      await currentSave;
      expect(edit.getSnapshot().targetId).toBeNull();
    }
  );
});
