package com.clipp.app;

import android.content.Context;
import android.content.SharedPreferences;

/** One process-wide owner serializes committed writes and refuses cached proof after failure. */
final class IdentityResetPersistence {
    // Matches @capacitor/preferences defaults; Clipp never configures another group.
    private static final String GROUP = "CapacitorStorage";
    private static IdentityResetPersistence instance;

    static synchronized IdentityResetPersistence forContext(Context context) {
        if (instance == null) {
            SharedPreferences preferences = context.getApplicationContext().getSharedPreferences(GROUP, Context.MODE_PRIVATE);
            instance = new IdentityResetPersistence(new Store() {
                public String get(String key) { return preferences.getString(key, null); }
                public boolean commit(String key, String value) {
                    SharedPreferences.Editor editor = preferences.edit();
                    if (value == null) editor.remove(key); else editor.putString(key, value);
                    return editor.commit();
                }
            });
        }
        return instance;
    }

    interface Store {
        String get(String key);
        boolean commit(String key, String value);
    }

    private final Store store;
    private boolean unconfirmed;

    IdentityResetPersistence(Store store) { this.store = store; }

    synchronized String get(String key) {
        requireConfirmed();
        return store.get(key);
    }

    synchronized void set(String key, String value) { write(key, value); }
    synchronized void remove(String key) { write(key, null); }

    private void write(String key, String value) {
        requireConfirmed();
        // commit(false), or a thrown commit, may already have changed SharedPreferences' cache.
        unconfirmed = true;
        if (!store.commit(key, value)) throw new IllegalStateException("identity_reset_commit_unconfirmed");
        unconfirmed = false;
    }

    private void requireConfirmed() {
        if (unconfirmed) throw new IllegalStateException("identity_reset_commit_unconfirmed");
    }
}
