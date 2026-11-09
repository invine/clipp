(async () => {
  const page = await optionPage();
  const pixels = await page.evaluate(() => {
    const img = document.querySelector('img[alt="My QR"]');
    if (!img || !img.complete || !img.naturalWidth) throw Error('QR image not loaded');
    const r = img.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(r.width); canvas.height = Math.round(r.height);
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, rgba: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data), copy: __uxClipboard.text, writes: __uxClipboard.writes, reads: __uxClipboard.reads, sourceWidth: img.naturalWidth };
  });
  const scanned = require('jsqr')(new Uint8ClampedArray(pixels.rgba), pixels.width, pixels.height);
  const { decodePairingTarget } = await import('./pairing-decoder.mjs');
  const qr = scanned ? decodePairingTarget(scanned.data) : null;
  const copied = decodePairingTarget(pixels.copy);
  out({ case: 'native-generated-qr-decode', image: { displayedWidth: pixels.width, displayedHeight: pixels.height, sourceWidth: pixels.sourceWidth }, imageDecoded: !!scanned, qrTargetValid: !!qr, copiedTargetValid: !!copied, sameTarget: !!qr && !!copied && qr.targetPeerId === copied.targetPeerId && Buffer.from(qr.signedPeerRecord).equals(Buffer.from(copied.signedPeerRecord)), guardedWrites: pixels.writes, guardedReads: pixels.reads, osClipboardQualified: false, cameraQualified: false, publicPayloadExported: false });
})();
