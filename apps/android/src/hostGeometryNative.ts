import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import {
  bindHostGeometry,
  type HostGeometrySnapshot,
} from "../../../packages/ui/src/hostGeometry";

type HostGeometryPlugin = {
  getSnapshot(): Promise<HostGeometrySnapshot>;
  addListener(
    event: "geometryChanged",
    callback: (snapshot: HostGeometrySnapshot) => void
  ): Promise<PluginListenerHandle>;
};
const nativeGeometry = registerPlugin<HostGeometryPlugin>("HostGeometry");

/** The document lifetime owns one native subscription, independent of client/session state. */
export function bindAndroidHostGeometry(): () => void {
  if (Capacitor.getPlatform() !== "android") return () => undefined;
  return bindHostGeometry(
    {
      getSnapshot: () => nativeGeometry.getSnapshot(),
      addListener: (callback) =>
        nativeGeometry.addListener("geometryChanged", callback),
    },
    window,
    document
  );
}
