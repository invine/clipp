# Chrome owning reset acceptance package

This separate, explicit package is source tooling for ticket 29. Normal `build`,
manifest, popup/options messages and reset 30 UI remain unchanged. It imports the
one actual production `chromeRuntime`; it replaces no Chrome networking, storage,
clipboard, reload or offscreen port. Source fixture tests do not qualify native
Chrome lifetimes, clipboard or late offscreen behavior.

## Build and first case

After source gates, mandatory nonauthor integration and current verification,
root may explicitly run:

```sh
npm --workspace apps/extension run build:reset-owning-acceptance
```

The builder requires clean source and creates one fresh `.local/chrome-reset-owning-*`
package. It retains normal CRX transforms, offscreen URL/loader, popup/options,
permissions and host permissions. It records full source HEAD/tree, selected
source hashes and all generated asset hashes. It neither launches Chrome nor
creates/seeds a profile. `root-reset-case.json` is deliberately absent: the worker
refuses to import the production owner until root supplies valid reviewed DATA.
The build receipt is not native admission or vendor/process/installation proof.

Root owns a new vendor/profile/Crashpad installation and one stable package path
and extension ID. Only `root-reset-case.json` may be atomically staged between
root-approved cases, after normal browser Quit and independently verified full
strict plus linked-helper absence. Preserve every prior case byte/hash outside
the package. All code, normal assets, vendor bytes and the build receipt remain
immutable. Do not reuse or migrate ticket 18 installations. Root's new preparer
must explicitly bind this DATA exception, current case/hash, assets and unchanged
origin; an old immutable-installation preparer does not authorize it.

The exact case schema is parsed before any owner import. Common keys are:
`version: 1`, `mode`, `caseId`, `extensionId`, `deadlineUnixMs`, `markers` (one to
eight distinct known `clipp-reset-` strings), distinct `nextMarker`, and
`expectedDeviceName` (a known synthetic `clipp-reset-` name). The fixed packaged
fetch is capped at 8 KiB and ten seconds. Unknown keys, malformed/expired input,
foreign extension and invalid UTF-8 fail closed. One original absolute deadline
at most 600 seconds ahead applies across every worker and browser incarnation;
reloading never grants another 600 seconds.

`observe-preflight` accepts only those common keys. `execute` and `observe-replay`
also require exact `operationId`, `reviewedPeerId`, `executeAfterUnixMs`, and
`expected` with `autoSync`, `localRetentionMs`, `pinnedCount` (one to eight) and
`configurationSha256` (SHA-256 of actual public relay configurations). The fixed
execute time must lie within the original 600-second window and at least one
second before the original deadline. The reviewed Peer ID and root case are the
sole execute authority; the witness page has no reset command.

## Actual preflight and scheduled execute

Use genuine product UI/native known-marker capture to create former Clips, a
nondefault synthetic name, applied settings, nontrivial public relay configuration
and a real pinned Clip. Root exports complete bounded preflight evidence and
normally quits Chrome. Chrome pins are session state: after a cold execution
launch, re-pin through genuine UI before the fixed root execute time. The entry
allows that ordinary UI preparation; it does not seed pins or settings.

Immediately before the scheduled begin, the actual owner must still have the
reviewed former identity, idle reset with no receipt, exact applied settings and
configuration hash, expected name, exact marker History and pin count. Any drift
refuses begin. Begin cannot run before the fixed time or more than two seconds
late; a throttled/late worker stays unqualified. A backward wall clock also cannot
extend the monotonic lifetime. Only one scheduled begin exists per former owner.

Actual completion calls the production `chrome.runtime.reload()` path. If begin
returns in the former worker, its witness explicitly says `restartRequired: true`;
that is not native success. After a genuine reload, a matching startup receipt
and completed-operation guard select readonly replay, even when the packaged mode
is still `execute`. Replay never calls begin/reconcile/resume a second time.
Mismatched receipt, guard, identity, settings or singleton state fails. Replay
allows zero History before baseline and one legitimate next-marker Clip with the
new origin; a later worker/browser incarnation must retain that Clip ID. It does
not demand empty History after legitimate new capture.

## Readonly witness collection

Open the fixed `reset-owning-witness.html` in the opted-in extension. It starts
paused. Observe once reads actual public state; Collect polls once per second;
Pause stops polling. Keep it paused while using normal Chrome Stop worker UI.
Actually observe the worker becoming inactive, then Observe once may wake it.
A fresh witness UUID alone proves no native restart. Browser cold restart also
needs distinct native PID/birth, full helper closure and the same profile/path/ID.

Only that exact extension-page sender and case nonce can request `read` or
`observe-once`. There are no begin/resume/stop/settings messages. An initial wake
can wait for the fixed-case validated startup. The normal production listener may
truthfully refuse requests while its former owner is fenced; such failures remain
unconfirmed, never bypassed by new normal message authority.

Rows contain public IDs/counts, known-marker equality counts, applied preferences,
configuration hash, copied public reset status and actual official offscreen
context IDs. Unknown Clip content refuses observation before serialization and
latches failure. No raw Clip content, clipboard read, credential/private key,
arbitrary storage value or raw exception enters an evidence row. Four-row read
chunks are copied; each row is capped at 4 KiB, each worker ledger at 256 rows /
512 KiB. The page retains at most 64 chunks / 2 MiB in memory, each exported chunk
at most 32 KiB. Pause and use Previous/Next chunk; root reads text through actual
CUA and saves each bounded chunk to owned external evidence before retirement.
There is no clipboard copy button, download, storage journal, native host, CDP or
network collector.

Extension reload may destroy a final predecessor row before external export.
Record the missing transient ledger/native gap explicitly; do not claim complete
continuity or reconstruct it from the successor. The page does not survive browser
Quit; root evidence does. Official context enumeration proves only observed real
documents. A genuinely late former offscreen callback still requires a captured
actual host race; no invented packet, inferred pass or private reconcile is used.

For the native clipboard gate, only the actual toolbar popup reopen/refocus reads
the clipboard. Options and the witness page do not. Keep the original synthetic
former marker unchanged during reset, qualify its first and repeated acknowledged
native reads with empty History, then root writes a distinct authorized next
marker and qualifies one new Clip/new origin and later retained Clip ID. Source
`shareClip` fixtures are forbidden as substitutes in this native recipe. Ticket 09
focused read/Retry evidence does not waive restart/baseline requirements. Missing
native evidence leaves ticket 29/G41 and reset 30 consumers unqualified.
