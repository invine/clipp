jest.mock(
  "../../clipp-electron-icons-bundle/clipp-purple-64.png",
  () => "icon"
);
jest.mock(
  "@multiformats/multiaddr",
  () => ({ multiaddr: (value: string) => ({ toString: () => value }) }),
  { virtual: true }
);
import type { ClipboardAppProps } from "../../packages/ui/src/ClipboardApp";

it("mounts History without optional Intl.Segmenter and preserves the exact preview input", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, "Segmenter")!;
  Object.defineProperty(Intl, "Segmenter", {
    value: undefined,
    configurable: true,
  });
  try {
    await jest.isolateModulesAsync(async () => {
      const React = await import("react");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { ClipboardApp } =
        await import("../../packages/ui/src/ClipboardApp");
      const content = "a".repeat(219) + "👩🏽‍💻 🇦🇪 e\u0301 full ending";
      const props: ClipboardAppProps = {
        clips: [
          {
            id: "unicode",
            type: "text",
            content,
            originPeerId: "local",
            capturedAt: 1,
            shareExpiresAt: 2,
          },
        ],
        devices: [],
        pending: [],
        peers: [],
        identity: null,
        pinnedIds: [],
        onDeleteClip() {},
        onUnpair() {},
        onAccept: async () => ({ ok: true, admitted: true }),
        onReject: async () => ({ ok: true, admitted: false }),
        onPairText: async () => ({ ok: true }),
        onRequestPairingCode: async () => null,
        onCopyPairingText: async () => ({ status: "copied" }),
        onReuseClip: () => "complete",
        onSetPinned() {},
        onClearAll() {},
      };
      const output = renderToStaticMarkup(
        React.createElement(ClipboardApp, props)
      );
      expect(output).toContain(content);
      expect(output).toContain('aria-label="View Clip details"');
      expect(output).toContain('aria-label="Copy Clip"');
    });
  } finally {
    Object.defineProperty(Intl, "Segmenter", descriptor);
  }
});
