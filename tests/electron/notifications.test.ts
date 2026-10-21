import { EventEmitter } from "node:events";
import { createElectronNotifications } from "../../apps/electron/src/notifications";
import { createIdentityBoundWorkFence } from "../../packages/core/runtime/identityInitialization";

it("native failure is available for recovery while click retains its request instance and fencing retires selection", async () => {
  const instances: NativeNotification[] = [];
  class NativeNotification extends EventEmitter {
    static isSupported() {
      return true;
    }
    constructor(_options: { title: string; body: string; silent: boolean }) {
      super();
      instances.push(this);
    }
    show() {
      this.emit("failed", {}, "UNErrorDomain error 1");
    }
    close() {
      this.emit("close");
    }
  }
  const fence = createIdentityBoundWorkFence();
  const owner = createElectronNotifications(NativeNotification, fence);
  await owner.notifications.show({
    id: "pairing-request-peer",
    instance: "request-version-1",
    title: "Pairing request",
    body: "Device",
  });
  expect(await owner.status.refresh()).toEqual({
    app: "unknown",
    channel: "not-applicable",
    displayError: "UNErrorDomain error 1",
  });
  instances[0].emit("click");
  const selected = jest.fn();
  owner.notifications.onSelect(selected);
  await new Promise((resolve) => setImmediate(resolve));
  expect(selected).toHaveBeenCalledWith(
    "pairing-request-peer",
    "request-version-1"
  );
  await fence.acquireFence();
  owner.closeAll();
  instances[0].emit("click");
  await new Promise((resolve) => setImmediate(resolve));
  expect(selected).toHaveBeenCalledTimes(1);
});

it("unsupported native capability reports availability and never constructs a notification", async () => {
  class Unsupported extends EventEmitter {
    static isSupported() {
      return false;
    }
    constructor(_options: { title: string; body: string; silent: boolean }) {
      super();
      throw Error("unsupported_native_constructor");
    }
    close() {}
    show() {}
  }
  const owner = createElectronNotifications(
    Unsupported,
    createIdentityBoundWorkFence()
  );
  await owner.notifications.show({
    id: "request",
    title: "Request",
    body: "Device",
  });
  expect((await owner.status.refresh()).app).toBe("unsupported");
});
