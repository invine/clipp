package com.clipp.app;

import android.content.Context;

final class PendingClipboardApplicationStore {
    private static final String PENDING_CLIPBOARD_APPLICATION = "pending_clipboard_application";
    private final DurableStringStore persistence;
    private final BackgroundContinuityDiagnostics diagnostics;

    PendingClipboardApplicationStore(Context context) {
        this(ClipContinuityPreferences.open(context), new BackgroundContinuityDiagnostics(context));
    }

    PendingClipboardApplicationStore(DurableStringStore persistence) {
        this(persistence, null);
    }

    private PendingClipboardApplicationStore(
        DurableStringStore persistence,
        BackgroundContinuityDiagnostics diagnostics
    ) {
        this.persistence = persistence;
        this.diagnostics = diagnostics;
    }

    String read() {
        return persistence.getString(PENDING_CLIPBOARD_APPLICATION, null);
    }

    boolean write(String clipId) {
        boolean written = persistence.putString(PENDING_CLIPBOARD_APPLICATION, clipId);
        if (written && diagnostics != null) diagnostics.recordPendingApplication(true);
        return written;
    }

    boolean clear() {
        boolean cleared = persistence.remove(PENDING_CLIPBOARD_APPLICATION);
        if (cleared && diagnostics != null) diagnostics.recordPendingApplication(false);
        return cleared;
    }
}
