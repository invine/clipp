# Complete Pairing Targets in one QR

Accepted proposal: losslessly compress the complete Pairing Target protobuf and encode it as Base45 for a QR. Preserve every Signed Peer Record envelope byte and all existing signature and identity checks. Existing pairing text remains supported.

## Transport

- Keep logical Pairing Target version 2, its canonical Peer ID bytes, optional Device Name hint, and complete opaque Signed Peer Record unchanged.
- Continue generating and accepting `clipp:pair:` unpadded Base64URL text. The copy action always returns that existing text so older devices can import it.
- QR generation may instead encode the exact protobuf as `CLIPP:PAIR:Z1:<Base45>:`. `Z1` specifies transport version 1, RFC 1950 zlib-wrapped DEFLATE followed by RFC 9285 Base45.
- Also support `CLIPP:PAIR:B1:<Base45>:` for the exact uncompressed protobuf when compression expands it. Compare QR symbol sizes with the existing text representation and select the smallest at the chosen error-correction level.
- The uppercase prefixes support QR Alphanumeric mode. The mandatory terminal colon provides explicit framing; all internal Base45 spaces remain significant. The body can contain colons; only the final colon is framing.
- Decode exactly one complete stream, rejecting truncated, corrupt, concatenated, dictionary-dependent, or trailing-data streams. Validate Base45 characters, lengths, and numeric ranges before decoding.
- Limit compressed input to the same maximum as decoded bytes, bound encoded input before allocation, and enforce the existing injectable 16 KiB decoded limit during decompression, before protobuf parsing. Reject malformed or unsupported wrappers without fallback.

## Presentation and integration

- Use one static QR, with a four-module white quiet zone and adequate source resolution. Prefer error correction M; if no complete representation fits M, try L. If no complete representation fits L, retain the existing copy-only fallback.
- Keep existing scanner string interfaces in Android and the Chrome extension. Put all wrapper generation and decoding in shared core so Electron, Android, and extension behave consistently.
- Scanned wrappers follow the existing import, verification, refresh, dial, and Trust Request flow. Invalid Signed Peer Records must still prevent dialing and requesting trust.
- The complete payload stays offline and self-contained. No address pruning, record re-signing, relay lookup token, or multi-frame transfer is introduced.

## Validation

- Round-trip complete targets through actual PNG QR images and jsQR, preserving the envelope byte-for-byte, canonical Peer ID, and Unicode Device Name hint.
- Cover a large compressible target that previously exceeded capacity, low-compressibility overflow, legacy decoding, whitespace preservation, malformed streams, and the decoded-size limit.
- Validate preserved real signed records and unchanged rejection before dialing through the import interface.
- Run typechecking, the full Jest suite, and Electron/Android/extension builds. Physical camera reliability needs separate device qualification.
