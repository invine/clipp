# Relay, popup and tray correction requirements

## Approved implementation scope

The complete acceptance criteria are authoritative in [ticket 01](issues/01-relay-popup-and-tray-controls.md). Deliver accurate managed-relay login and header feedback, compact extension full-page navigation, legible Electron tray artwork, and normal-click open/right-click options behavior. This is one approved ticket with no blocking edges.

## Device status constraint

Finding 2 is excluded from ticket 01. Reuse its existing connection-status text and preserve card height. Do not add duplicate text or another line. The earlier proposal to add redundant status wording was rejected.

## Separate connectivity troubleshooting

Finding 3 requires a separate session. No failing extension/Electron or Android/Electron pair was reproduced in the analysis session; the passing isolated native harness does not establish the cause of either reported failure. It does not block ticket 01.

## Publication authorization

The user approved publication on 2026-11-05 and explicitly instructed “Do not start implementation.” No implementation, claim, source edit, commit or runtime mutation is authorized by the publishing session.
