# Complete Pairing Targets in QR codes

Research date: 2026-10-05. Exploration only; no protocol decision or production change.

## Finding

The strongest candidate for one ordinary, offline QR is **lossless DEFLATE of the complete Pairing Target protobuf, followed by Base45 in QR Alphanumeric mode**. This keeps every original Signed Peer Record envelope byte, uses the existing text scanner interfaces, and removes most of Base64URL's QR overhead. Real payload measurements and camera trials must determine how often it fits.

There is no lossless scheme that guarantees every arbitrary 16 KiB accepted target fits one standard QR. RFC 1951 explicitly explains that no lossless compressor can shrink every input. Clipp's target validation bound is much larger than a QR's capacity. A universal guarantee requires changing the accepted data bound, splitting across QR frames, or moving some data outside the QR. The latter does not satisfy complete offline transfer. [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951.html), [local target limit](../../packages/core/pairing/v2.ts).

## Capacity comparison

QR Version 40 has 177 × 177 modules. At error correction L, the encoder's documented maximum is 2,953 Byte-mode bytes or 4,296 Alphanumeric characters; M reduces these to 2,331 and 3,391. Clipp already requests L. Increasing display dimensions improves scanability but does not increase symbol capacity. [DENSO WAVE](https://www.qrcode.com/en/about/version.html), [qrcode maintainer documentation](https://github.com/soldair/node-qrcode#qr-code-capacity), [current generation](../../packages/core/pairing/qrCode.ts).

| Transport                     | Approximate QR bits per input byte | Version 40-L payload budget                                                                     |
| ----------------------------- | ---------------------------------: | ----------------------------------------------------------------------------------------------- |
| Current Base64URL text        |                              10.67 | About 2,206 protobuf bytes with the current 11-character prefix, if encoded as one Byte segment |
| DEFLATE + Base64URL           |          10.67 per compressed byte | About 2.2 KiB compressed bytes, minus new framing                                               |
| DEFLATE + Base45              |           8.25 per compressed byte | About 2.85 KiB compressed bytes with a short uppercase prefix                                   |
| DEFLATE + binary Byte segment |              8 per compressed byte | 2,953 compressed bytes minus binary framing                                                     |

The budget arithmetic above is derived from documented capacities, not measured payload results. Automatic mixed-mode optimization can shift the Base64URL threshold. Base45 encodes two bytes as three characters, and QR Alphanumeric mode encodes two characters in eleven bits. Consequently Base45 needs about 23% fewer QR data bits than Base64URL, although its visible text has more characters. Its alphabet contains uppercase letters, digits, space, and `$%*+-./:`. Use an uppercase recognition prefix and an explicit Alphanumeric segment; retaining the lowercase prefix adds a Byte segment. [RFC 9285](https://www.rfc-editor.org/rfc/rfc9285.html).

Binary mode buys only about 3% beyond Base45 before framing, so scanner compatibility makes Base45 preferable as the first experiment.

## Desktop sample measured during exploration

The local readonly measurement used a persisted public record from the Electron SQLite database, rather than a verified currently running app. Its twenty addresses included fourteen relay paths and two each of WebRTC Direct, TCP, and WebSocket addresses. The 2,167-byte record produced a 2,212-byte target protobuf containing all required fields, without the optional Device Name hint. Node zlib DEFLATE at level 9 reduced that protobuf to 467 bytes.

| Candidate                   | Encoded QR text length | Encoder result at L     |
| --------------------------- | ---------------------: | ----------------------- |
| Existing Base64URL target   |                  2,961 | Capacity failure        |
| DEFLATE + Base64URL wrapper |                    636 | Version 17, 85 modules  |
| Uncompressed Base45 wrapper |                  3,332 | Version 35, 157 modules |
| DEFLATE + Base45 wrapper    |                    715 | Version 15, 77 modules  |
| DEFLATE + binary, unframed  |                 Binary | Version 15, 77 modules  |

The fitting candidates passed exact byte round trips through jsQR on generated pixels for this sample. Across four stored records, all compressed Base45 candidates preserved the complete signed envelope through decoding. One uncompressed Base45 candidate generated successfully but failed jsQR decoding on generated pixels; capacity and scanner success are separate results. The compressed desktop sample also fit M at Version 17 and H at Version 24, so testing M with a four-module quiet zone is a reasonable camera-trial starting point. These results demonstrate a strong compression opportunity in this sample set; they do not establish camera reliability, current live app address count, or fitting rates across devices. Text lengths reflect experimental framing, including a terminal colon for Base45, and should not be treated as finalized protocol formats. [Measurement harness](measure.mjs), [recorded measurements](measurements.jsonl).

## Preserve the trust boundary

Compress the existing protobuf **bytes**, not an address list or a reserialized signed record. Inflate to the same bytes, parse the existing version 2 logical target, and perform the current signed-record verification and subject check before dialing. Compression is a transport wrapper, with its own unambiguous prefix/version and declared codec. Existing `clipp:pair:` targets should remain accepted. Keep the existing copy text available for old clients; old clients cannot understand a new QR wrapper. [Target specification](../pairing-and-trust/spec.md#pairing-target), [import path](../../packages/core/pairing/target.ts).

Repeated Peer IDs, multiaddr components, relay paths, and protocol framing should provide compression opportunities; keys and signatures have less compressible entropy. This is an inference to verify with representative real records. DEFLATE uses references to repeated byte sequences and Huffman coding. Select the smaller uncompressed/compressed representation instead of assuming compression always helps. [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951.html).

Bound encoded input before allocation, validate Base45 strictly, and enforce the existing 16 KiB **inflated** limit during decompression, aborting before unbounded accumulation. Reject corrupt streams, unexpected trailing data, invalid framing, and oversized output before protobuf parsing. Do not inflate a potentially huge result and only then check its size. These are design requirements for an untrusted scanner input, rather than behavior supplied automatically by every compression library.

## Scanner and runtime compatibility

Android prefers `BarcodeDetector.rawValue` and falls back to `jsQR.data`; the extension's image scanner also consumes `jsQR.data`. Both accept ASCII Base45 text without changing their scanner return types. BarcodeDetector exposes a DOMString, without a standard raw-byte property. jsQR separately exposes `binaryData` and byte chunks, so binary QR is possible if Clipp bypasses the native string result and changes its scanner/import interface. Arbitrary binary bytes must be passed to qrcode as an array/Buffer, not converted to a JavaScript string. [BarcodeDetector specification](https://wicg.github.io/shape-detection-api/#detectedbarcode), [jsQR source](https://github.com/cozmo/jsQR/blob/master/src/index.ts), [qrcode binary instructions](https://github.com/soldair/node-qrcode#binary-data), [Android scanner](../../apps/android/src/qrCameraScanner.ts), [extension scanner](../../apps/extension/src/components/QRScanner.tsx).

**Base45 whitespace:** shared UI calls `.trim()` on pasted and scanned targets. Base45 can contain internal spaces that must be preserved. A valid Base45 body cannot end in a space: the final digit is at most 32 for a three-character group or 5 for a two-character group, while space has value 36. The uppercase prefix already protects leading body spaces from trimming. The chosen terminal colon provides explicit framing rather than repairing a trailing-space problem. Percent-encoding Base45 would sacrifice its QR advantage and is unnecessary for the existing in-app scanner. [UI entry points](../../packages/ui/src/ClipboardApp.tsx), [Base45 alphabet](https://www.rfc-editor.org/rfc/rfc9285.html#section-4.2).

Compression Streams standardizes `deflate`, `deflate-raw`, and `gzip`; its interfaces are available to window/worker environments. Feature-detect the particular codec by constructing it. Electron's pinned runtime and modern Chrome can use native APIs, but an Android OS minimum does not establish the installed WebView version or codec support. Native streams make the transport decoder asynchronous; the current `decodePairingTarget` is synchronous. A portable pure JavaScript codec such as fflate supports browser and Node bundles and can retain synchronous decoding, but its chosen decompression API must actually enforce the output bound. Its browser/Node exports must be checked in Electron CommonJS and Vite builds. [Compression standard](https://compression.spec.whatwg.org/), [Chrome API documentation](https://developer.chrome.com/blog/compression-streams-api), [fflate maintainer documentation](https://github.com/101arrowz/fflate), [runtime dependency declarations](../../apps/electron/package.json).

## Overflow fallback and validation

Standard QR Structured Append supports up to sixteen symbols, but the installed jsQR mode definitions do not include Structured Append, and the installed qrcode encoder documents Numeric, Alphanumeric, Byte, and Kanji modes. It is not a drop-in switch. Application-level animated frames containing ordinary text QRs are a more direct fallback, with transfer ID, frame index/count, bounded assembly, expiry, and integrity checks. Scan/import should only start pairing after complete reassembly. This fulfills complete offline transfer but is explicitly multiple QR symbols. [DENSO WAVE Structured Append](https://www.qrcode.com/en/about/featurePage/featurePage6.html), [jsQR modes](https://github.com/cozmo/jsQR/blob/master/src/decoder/decodeData/index.ts), [qrcode modes](https://github.com/soldair/node-qrcode#encoding-modes).

Measure real Electron targets with multiple relays, VPNs, network interfaces, and long names; retain byte equality and verify the real signatures after decoding. Include low-compressibility inputs and capacity boundaries. Trial actual Android cameras and the extension image scanner at several display sizes. A maximum-capacity symbol can technically encode while being difficult to scan; Clipp currently generates with no quiet-zone margin and scale 2, so display padding, module size, and contrast need visual verification separately from capacity.
