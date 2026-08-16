import { normalizeDeviceName } from "../../../packages/core/pairing/presentation";

describe("Device presentation", () => {
  it.each(["Mobile\u0085Name", "Mobile\u2028Name", "Mobile\u2029Name"])(
    "rejects control-bearing or multi-line name %p",
    (name) => {
      expect(normalizeDeviceName(name)).toBeUndefined();
    },
  );
});
