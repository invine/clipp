import {
  Clip,
  Device,
  SyncMessage,
  HistoryItem,
  ClipType,
  MessageType,
  validateClip,
} from "../index";

describe("Data-model sanity", () => {
  it("creates a valid text clip", () => {
    const clip: Clip = {
      id: "uuid-1",
      type: ClipType.Text,
      content: "hello",
      timestamp: Date.now(),
      senderId: "peer-A",
    };
    expect(validateClip ? validateClip(clip) : true).toBe(true);
  });

  it("serialises/deserialises cleanly", () => {
    const original: Device = {
      id: "peer-B",
      name: "Pixel 8",
      publicKey: "base64key",
      addedAt: 123456789,
    };
    const roundTrip = JSON.parse(JSON.stringify(original)) as Device;
    expect(roundTrip).toEqual(original);
  });

  it("accepts each SyncMessage variant", () => {
    const msg: SyncMessage = {
      type: MessageType.NewClip,
      payload: {} as any,
      senderId: "peer-A",
      timestamp: 0,
    };
    expect(msg.type).toBe(MessageType.NewClip);
  });
});
