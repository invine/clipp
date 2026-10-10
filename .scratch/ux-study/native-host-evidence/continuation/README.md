# Non-account native continuation

This round uses separate disposable profiles and the unchanged builds identified by `source-receipt.json`. Sign-in stays deferred.

- `chrome.cjs` launches Chrome for Testing without Playwright auto-attach. Browser-level CDP observes target lifetime; optional read-only options observations immediately detach. No popup debugger is attached. The first run never attaches to a worker. The second run briefly attaches only to close its offscreen document, then detaches before observing natural worker termination. Native UI input comes from CUA or a requested human click.
- Startup race and selection of Chrome's built-in `thunk.js` worker were harness mistakes. Before any Clipp action, selection was corrected to this build's `/service-worker-loader.js`; the corrected environment records that fact. Do not count the built-in worker's destruction as Clipp suspension.
- `electron.cjs` launches a fresh acceptance profile with memory clipboard I/O and empty WSS-only relay configuration. Main-process event/state logging is passive and does not focus the window. Public identity comparisons stay in memory; receipts contain booleans only.
- `hold-sqlite-writer.py` holds a SQLite write transaction in the owned profile without reading values or changing rows. It induces genuine native SQLite lock contention, not a mocked UI failure; this is not a disk-full or filesystem-permission test. A newline releases the lock.

Results and remaining prerequisites are appended after execution. No application source is edited and no operator store is opened.


Completed outcomes are in [the continuation report](../../native-host-continuation.md). `chrome-first-environment.json`/`chrome-first-closed.json` identify the first profile; `chrome-environment.json`/`chrome-closed.json` identify the second offscreen-absent run. The shared trace includes timestamps and distinct extension IDs. The worker naturally stopped in the second run after about 30 seconds; an observer socket timeout across a wall-clock gap was recovered before checking new worker/offscreen targets and public state.

`identity-recovery.cjs` owns both the initial Electron process and the automatic relaunch using a profile-local stop flag. `prepare-identity-loss.py` was run only after normal shutdown; it replaced one synthetic profile's private-key field without selecting/exporting it. Both owned PIDs are confirmed dead in `identity-closed.json`. `manual-observations.json` records the user's click-away and tray reports separately from machine traces.

Images: `sqlite-write-blocked.png` shows genuine contention; `sqlite-write-recovered.png` is an early sample **still pending**, despite its name; `sqlite-auto-retry-complete.png` is the actual recovered state; `identity-recovered.png` shows the actual automatic-reset notice. The blocked, final-retry and identity-recovery images were visually inspected. Dismiss was not qualified: CUA returned noWindowsAvailable after automatic relaunch.
