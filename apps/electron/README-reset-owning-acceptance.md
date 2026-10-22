# Opt-in owning reset entry

This acceptance build exercises the normal Electron runtime below the future
manual-reset UI. The default main entry and renderer action surface are unchanged.
It is not an authenticated product reset action or a ticket 30 feature.

After the coordinator releases build resources, from the repository root:

```sh
npm --workspace apps/electron run build:reset-owning-acceptance
```

The builder creates a fresh `.local/electron-reset-owning-*` output containing
`reset-owning-acceptance.cjs`, the normal preload and renderer, and a build receipt.
It does not replace normal `dist`, install an app or launch Electron. Root must
bind every packaged asset and native dependency separately before acceptance;
the build receipt alone is not a complete installation proof.

The CJS module exports `startElectronResetOwningAcceptance(manifestText, emit)`.
Importing it does not start an owner. Only the explicitly admitted actual Electron
main-process launcher may call it. Invalid input is rejected before importing the
runtime; valid input starts exactly the existing `startElectronRuntime` singleton.
The function returns an idempotent `stop` handle. The launcher also owns a finite
hard process lifetime: a stuck startup or stop cannot certify process closure.

The immutable manifest is at most 8 KiB, with version 1, case ID, absolute deadline
(no more than ten minutes ahead), and one of these modes:

- `observe-preflight` observes the normal public owner while ordinary UI actions
  create synthetic data and set installation preferences.
- `execute` requires operation ID, reviewed current Peer ID and exact expected
  public settings, History markers, pin count and public configuration digest.
  It calls the public owning reset once. Real lifecycle `app.relaunch` and
  `app.exit` remain untouched. A returned completion in the former process is
  explicitly reported as restart required.
- `observe-replay` cannot begin or resume a reset. It requires the same operation
  and former Peer ID, durable receipt, replacement default name/revision/singleton,
  preserved settings/configuration, and initially empty History. Later observations
  permit only the specified new synthetic clipboard marker with the replacement
  origin. Receipt absence, stale data and wrong operation remain failures.

Expected configuration SHA256 is over UTF-8 `JSON.stringify` of the public
`managedRelayConfigurations` array. No credential/private key or clipboard text
is emitted. Observations contain selected public IDs, counts, marker-match flags
and public preference/configuration metadata; they are change-only and capped.
No clipboard operation is added by this entry: native polling remains production.

The root launcher must validate fresh single-use admission, owned executable,
source/assets, disposable profile identity, actual main-process identity and
normal environment **before** importing/starting this entry. The execute admission
is spent. Actual `app.relaunch()` retains the entry/argv/profile; the replacement
must wait before owner/SQLite startup for a **fresh** root-issued admission bound
to successor PID/birth and the original profile. Root issues it only after proving
predecessor main/helper absence. Unexpected argv, extra relaunch, expired original
deadline or unreadable ownership stops the interval. The entry does not grant this
admission, change the profile, inspect other processes or certify its own absence.

Native clipboard equality, unchanged-marker baseline, changed-marker capture,
real process replacement and final helper absence require the coordinator's fresh
isolated native interval. Source fixtures use inert OS boundaries and are labelled
accordingly. They cannot establish native clipboard, encryption or networking
qualification. Saved protected relay-credential preservation is exercised through
public auth and real SQLite with synthetic external protection/token boundaries;
no real account is needed and memory-only session continuity is not promised.
