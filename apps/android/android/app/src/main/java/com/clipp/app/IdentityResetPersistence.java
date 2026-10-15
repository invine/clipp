package com.clipp.app;

/** One process-wide owner serializes committed writes and refuses cached proof after failure. */
final class IdentityResetPersistence {
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
