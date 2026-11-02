# Android host geometry

`HostGeometryPlugin` measures the host. `bindAndroidHostGeometry` connects its
initial snapshot and changes to the document lifetime. The shared shell, drawer,
TaskDialog, displayed QR and camera scanner surface consume the same CSS content
rectangle. A geometry update does not create a client or UI session.

## Reservation owner

The renderer reserves only the intersection of the native safe window with the
**actual measured WebView**. The native plugin does not add padding, margins or
consume insets. Android's `adjustResize` remains enabled; if Android has already
fitted or resized the WebView, the intersection accounts for that reservation.
Neither CSS `env(safe-area-inset-*)` nor a second keyboard offset is applied.

API 30 and later use current window metrics and the union of system bars, display
cutout and visible IME insets. Overlapping navigation and IME space uses the
maximum inset rather than their sum. On earlier Android the platform's already
fitted visible display frame supplies the safe rectangle. The earlier-than-30
path remains a compatibility fallback requiring its own environment evidence.

The initial API35 acceptance baseline measured a 1080×1920 physical window and
WebView at screen origin, 63px status and 126px navigation reservations, density
2.625, and a 412.19049×732.19049 CSS viewport (integer `innerWidth`/`innerHeight`
round to 412/732). This establishes edge-to-edge WebView rendering with native
bars still present. The receipt is outside the disposable worktree at
`.local/ux-implementation/run-20261010/ticket-12-native-measurement-android-interval-result.json`
and the earlier CSS measurement at `ticket-12-baseline-android-readiness-result.json`.

## Units and lifecycle

`windowPx`, `webViewPx`, `safeAreaPx` and the named bar/cutout/IME insets are
physical pixels in screen coordinates. `density` converts physical px to dp;
`fontScale` is an independent native setting. CSS conversion uses physical
WebView width divided by the measured CSS document viewport width; density is
not assumed to equal that ratio. One uniform ratio converts both axes and avoids
using a transient stale viewport height during an IME transition.

Snapshots have a monotonic sequence within the live plugin. Subscribe before
requesting the initial snapshot; a delayed older reply cannot replace a later
layout event. Resume, configuration, WebView layout and inset delivery refresh
measurements. Disposal removes native/DOM listeners, pending focus reveal and
CSS values, including a native registration completing after disposal.

The shared document binding reveals a focused input within its owning scroller
after bounds change. Task actions remain reachable by scrolling the drawer or
dialog. Scanner construction exposes a geometry-only surface for qualification;
it does not construct BarcodeDetector, request media or trigger permissions.
Its frame follows available video space and its toolbar can scroll at short
heights. Real scanner provider/input/lifecycle qualification belongs to tickets
14/15; native Back input belongs to ticket13.

Draft retention applies only to a surviving live Activity/WebView document.
Destroyed Activity/WebView, reload and restart do not gain persistence promises.
Native font scale is recorded separately from measured WebView text effect;
explicit CSS text enlargement is labelled as a fixture in acceptance evidence.

## Rendered regression

`node tests/harness/host-geometry.mjs [output-directory]` bundles the actual shared
shell, relay task, QR and scanner surface into an isolated headless browser. It
checks nonzero bar/cutout/IME geometry, a 1200px viewport narrowed to1060px usable
width, short/narrow scrollers, last-action reachability and repeated unchanged
geometry after manual task scrolling. The optional output directory preserves
the fixture bundle and JSON measurements. An installed Playwright Chromium is
required. This controlled geometry fixture supplements real native acceptance;
it does not acquire media or read/write the clipboard.

## Control target units

The same document binding installs `--clipp-target-min`. It converts48dp through
native density and the measured physical WebView/CSS document width ratio, with
at least40CSS pixels for pointer targets. It updates this token even when safe
bounds stay the same, without repeating focus scrolling. Disposal restores the
previous inline target value. The renderer must measure physical/native targets
for acceptance; CSS minima alone do not qualify Android tap bounds.
