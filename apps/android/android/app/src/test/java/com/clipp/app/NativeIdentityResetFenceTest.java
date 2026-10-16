package com.clipp.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;

public class NativeIdentityResetFenceTest {
    @Test public void independentOwnersRefuseAdmissionUntilProvisionalFenceIsReleased() {
        Map<String, String> disk = new HashMap<>();
        IdentityResetPersistence persistence = persistence(disk);
        NativeIdentityResetFence first = new NativeIdentityResetFence(persistence);
        NativeIdentityResetFence reopened = new NativeIdentityResetFence(persistence);
        assertFalse(first.isBlocked());
        first.acquire();
        assertTrue(reopened.isBlocked());
        first.release();
        assertFalse(reopened.isBlocked());
    }

    @Test public void acceptedIntentAndSealedFenceCannotBeReleasedByOldOwner() {
        Map<String, String> disk = new HashMap<>();
        IdentityResetPersistence persistence = persistence(disk);
        NativeIdentityResetFence fence = new NativeIdentityResetFence(persistence);
        fence.acquire();
        persistence.set(NativeIdentityResetFence.JOURNAL, "accepted-private-intent");
        try { fence.release(); fail(); } catch (IllegalStateException expected) {}
        persistence.remove(NativeIdentityResetFence.JOURNAL);
        fence.seal();
        try { fence.release(); fail(); } catch (IllegalStateException expected) {}
        assertTrue(new NativeIdentityResetFence(persistence).isBlocked());
    }

    @Test public void failedAdmissionCommitCannotAuthorizeIndependentIngressFromUpdatedCache() {
        Map<String, String> cache = new HashMap<>();
        NativeIdentityResetFence fence = new NativeIdentityResetFence(new IdentityResetPersistence(new IdentityResetPersistence.Store() {
            public String get(String key) { return cache.get(key); }
            public boolean commit(String key, String value) { cache.put(key, value); return false; }
        }));
        try { fence.acquire(); fail(); } catch (IllegalStateException expected) {}
        assertTrue(fence.isBlocked());
    }

    @Test public void partialNativeQueueDeletionCannotPassVerificationFromPreferenceCache() {
        NativeIdentityResetFence fence = new NativeIdentityResetFence(persistence(new HashMap<>()));
        Map<String, String> queues = new HashMap<>();
        queues.put("actions", "former-actions");
        queues.put("pending_clipboard_application", "former-remote-pointer");
        DurableStringStore queueStore = new DurableStringStore() {
            public String getString(String key, String fallback) { return queues.getOrDefault(key, fallback); }
            public boolean putString(String key, String value) { queues.put(key, value); return true; }
            public boolean remove(String key) { queues.remove(key); return !key.equals("pending_clipboard_application"); }
        };
        try { fence.clearQueues(queueStore); fail(); } catch (IllegalStateException expected) {}
        assertTrue(fence.isBlocked());
        try { fence.verifyQueues(queueStore); fail(); } catch (IllegalStateException expected) {
            assertEquals("identity_reset_native_cleanup_unconfirmed", expected.getMessage());
        }
    }

    private IdentityResetPersistence persistence(Map<String, String> disk) {
        return new IdentityResetPersistence(new IdentityResetPersistence.Store() {
            public String get(String key) { return disk.get(key); }
            public boolean commit(String key, String value) {
                if (value == null) disk.remove(key); else disk.put(key, value);
                return true;
            }
        });
    }
}
