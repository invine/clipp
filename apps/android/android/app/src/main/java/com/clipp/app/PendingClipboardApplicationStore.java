package com.clipp.app;

import android.content.Context;

final class PendingClipboardApplicationStore {
    private static final String PENDING_CLIPBOARD_APPLICATION = "pending_clipboard_application";
    private final DurableStringStore persistence;

    PendingClipboardApplicationStore(Context context) {
        this(ClipContinuityPreferences.open(context));
    }

    PendingClipboardApplicationStore(DurableStringStore persistence) {
        this.persistence = persistence;
    }

    String read() {
        return persistence.getString(PENDING_CLIPBOARD_APPLICATION, null);
    }

    boolean write(String clipId) {
        return persistence.putString(PENDING_CLIPBOARD_APPLICATION, clipId);
    }

    boolean clear() {
        return persistence.remove(PENDING_CLIPBOARD_APPLICATION);
    }
}
