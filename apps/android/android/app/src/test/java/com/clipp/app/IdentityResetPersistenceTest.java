package com.clipp.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;

public class IdentityResetPersistenceTest {
    @Test
    public void failedCommitCannotBeConfirmedFromUpdatedPreferenceCache() {
        Map<String, String> cache = new HashMap<>();
        IdentityResetPersistence store = new IdentityResetPersistence(new IdentityResetPersistence.Store() {
            public String get(String key) { return cache.get(key); }
            public boolean commit(String key, String value) {
                cache.put(key, value); // Android updates memory even when disk persistence fails.
                return false;
            }
        });
        try { store.set("clipp-android:manualIdentityReset", "private-intent"); fail(); }
        catch (IllegalStateException expected) { assertEquals("identity_reset_commit_unconfirmed", expected.getMessage()); }
        try { store.get("clipp-android:manualIdentityReset"); fail(); }
        catch (IllegalStateException expected) { assertEquals("identity_reset_commit_unconfirmed", expected.getMessage()); }
        try { store.remove("clipp-android:manualIdentityReset"); fail(); }
        catch (IllegalStateException expected) { assertEquals("identity_reset_commit_unconfirmed", expected.getMessage()); }
    }

    @Test
    public void thrownCommitAlsoRequiresProcessRestartBeforeReadOrRetry() {
        IdentityResetPersistence store = new IdentityResetPersistence(new IdentityResetPersistence.Store() {
            public String get(String key) { return "unconfirmed-cache"; }
            public boolean commit(String key, String value) { throw new IllegalStateException("disk_unavailable"); }
        });
        try { store.set("clipp-android:manualIdentityReset", "private-intent"); fail(); }
        catch (IllegalStateException expected) { assertEquals("disk_unavailable", expected.getMessage()); }
        try { store.get("clipp-android:manualIdentityReset"); fail(); }
        catch (IllegalStateException expected) { assertEquals("identity_reset_commit_unconfirmed", expected.getMessage()); }
    }
}
