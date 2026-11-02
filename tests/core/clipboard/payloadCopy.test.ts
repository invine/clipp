import { copyPayloadText } from "../../../packages/core/clipboard/payloadCopy";

it("reports confirmed native writes and definite rejections", async () => {
  let clipboard = "";
  expect(
    await copyPayloadText("target", async (text) => {
      clipboard = text;
    })
  ).toEqual({ status: "copied" });
  expect(clipboard).toBe("target");
  expect(
    await copyPayloadText("target", async () => {
      throw new Error("denied");
    })
  ).toEqual({ status: "rejected" });
});

it("does not repeat a native write when acknowledgement is lost", async () => {
  jest.useFakeTimers();
  let writes = 0;
  const result = copyPayloadText(
    "target",
    () => {
      writes++;
      return new Promise(() => undefined);
    },
    25
  );
  await jest.advanceTimersByTimeAsync(25);
  expect(await result).toEqual({ status: "unconfirmed" });
  expect(writes).toBe(1);
  jest.useRealTimers();
});
