# 03 — Align content-script capture with extension runtime capabilities

**Status:** needs-triage

**What to investigate:** The runtime capability specification describes explicit extension clipboard input as popup-supplied, while the manifest injects a content script on all matching pages and captures page copy/cut events even when the popup is closed. Decide whether content-script capture is a supported capability that should be specified and tested or an implementation path that should be removed.

This is intentionally separate from repairing the invalid offscreen Clipboard API boundary.

## Comments
