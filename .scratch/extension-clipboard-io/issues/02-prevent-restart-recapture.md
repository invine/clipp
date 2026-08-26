# 02 — Prevent unchanged clipboard recapture after extension restart

**Status:** needs-triage

**What to investigate:** The extension's capture baseline lives in service-worker memory and the popup's last-observed value lives only for that popup instance. Determine how reopening the popup after a service-worker restart can avoid creating another Local Clip for unchanged system clipboard content, consistent with Clip event identity and restart echo-suppression rules.

This is intentionally separate from repairing the invalid offscreen Clipboard API boundary.

## Comments
