// Public synthetic UI state; does not establish pairing/network correctness.
module.exports = async function (base) {
  const { generateKeyPair } = await import("@libp2p/crypto/keys");
  const { peerIdFromPrivateKey } = await import("@libp2p/peer-id");
  const { randomUUID } = require("node:crypto");
  const ids = [];
  for (let i = 0; i < 24; i++)
    ids.push(peerIdFromPrivateKey(await generateKeyPair("Ed25519")).toString());
  const clock = Date.now(),
    day = 86400000;
  const content = [
    "Study: one-line shopping note",
    "https://example.invalid/path/" + "long-segment/".repeat(24),
    "Two indistinguishable previews: " + "A".repeat(250) + " END ONE",
    "Two indistinguishable previews: " + "A".repeat(250) + " END TWO",
    "Long unbroken value " + "X".repeat(2000),
    "Line 1: summary\nLine 2: details\nLine 3: details\nLine 4: details\nLine 5: IMPORTANT FINAL VALUE",
    "Emoji and mixed scripts: مرحبا / 東京 / 👩🏽‍💻",
  ];
  const s = {
    ...structuredClone(base),
    identity: { ...base.identity, deviceName: "Study desktop" },
    clips: Array.from({ length: 200 }, (_, i) => ({
      id: randomUUID(),
      type: i % 7 === 1 ? "url" : "text",
      content: content[i % 7],
      originPeerId: i % 3 === 0 ? base.identity.deviceId : ids[i % 20],
      capturedAt: clock - i * 3600000,
      shareExpiresAt: clock + day,
    })),
    devices: ids
      .slice(0, 20)
      .map((id, i) => ({
        deviceId: id,
        deviceName:
          i === 0
            ? "Desktop – " + "LongName".repeat(6)
            : i === 1
              ? "Study Android"
              : i === 2
                ? "Study Chrome"
                : "Study device " + (i + 1),
      })),
    peers: [ids[0]],
    peerConnections: [
      {
        peerId: ids[0],
        path: "relay",
        hasDirect: false,
        hasRelay: true,
        addrs: [],
      },
    ],
    pending: [],
    waiting: [],
    pairingErrors: [],
    pinnedIds: [],
    managedRelayConfigurations: [],
    managedRelayStates: [],
    autoSync: true,
    clipboardHistoryError: null,
    historyPolicyError: null,
    identityRotationRecovery: false,
    identityRotationNotice: null,
    localRetentionMs: 90 * day,
  };
  s.pinnedIds = s.clips.slice(0, 3).map((c) => c.id);
  return {
    clock,
    ids,
    dense: s,
    typical: {
      ...s,
      clips: s.clips.slice(0, 12),
      devices: s.devices.slice(0, 3),
    },
  };
};
