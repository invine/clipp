import { createWriter } from "../writer";
import type { Clip } from "../../models/Clip";
import { ClipType } from "../../models/enums";
import { jest } from "@jest/globals";

describe("Clipboard writer", () => {
  test("writes text clip", async () => {
    const fn = jest.fn(async (_: string) => {});
    const writer = createWriter(fn);
    const clip: Clip = {
      id: "1",
      type: ClipType.Text,
      content: "abc",
      timestamp: Date.now(),
      senderId: "me",
    };
    await writer.write(clip);
    expect(fn).toHaveBeenCalledWith("abc");
  });

  test("writes url clip", async () => {
    const fn = jest.fn(async (_: string) => {});
    const writer = createWriter(fn);
    const clip: Clip = {
      id: "u1",
      type: ClipType.Url,
      content: "https://example.com",
      timestamp: Date.now(),
      senderId: "me",
    };
    await writer.write(clip);
    expect(fn).toHaveBeenCalledWith("https://example.com");
  });

  test("rejects unknown type", async () => {
    const fn = jest.fn(async (_: string) => {});
    const writer = createWriter(fn);
    const clip: Clip = {
      id: "2",
      type: "image",
      content: "xxx",
      timestamp: Date.now(),
      senderId: "me",
    } as any;
    await writer.write(clip);
    expect(fn).not.toHaveBeenCalled();
  });
});
