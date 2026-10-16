package com.clipp.app;

import android.content.Context;
import org.json.JSONObject;
import java.util.UUID;

/** Shared by native ingress, pointer writers and lifecycle entry points, even without a WebView. */
final class NativeIdentityResetFence {
    static final Object LOCK = new Object();
    static final String PREFIX = "clipp-android:";
    static final String JOURNAL = PREFIX + "manualIdentityReset";
    static final String MARKER = PREFIX + "nativeIdentityResetFence";
    private boolean cleanupUnconfirmed;
    private static NativeIdentityResetFence instance;
    private static String generation = UUID.randomUUID().toString();
    static String generation() { synchronized (LOCK) { return generation; } }
    private final IdentityResetPersistence persistence;

    NativeIdentityResetFence(IdentityResetPersistence persistence) { this.persistence = persistence; }
    static synchronized NativeIdentityResetFence forContext(Context context) {
        if (instance == null) instance = new NativeIdentityResetFence(IdentityResetPersistence.forContext(context));
        return instance;
    }

    boolean isBlocked() {
        synchronized (LOCK) {
            try {
                if (cleanupUnconfirmed) return true;
                if (persistence.get(MARKER) != null || persistence.get(JOURNAL) != null) return true;
                requireValidMetadata();
                return false;
            }
            catch (RuntimeException unavailable) { return true; }
        }
    }

    private void requireValidMetadata() {
        try {
            String guardRaw = persistence.get(PREFIX + "manualIdentityResetCompleted");
            String receiptRaw = persistence.get(PREFIX + "manualIdentityResetReceipt");
            JSONObject guard = guardRaw == null ? null : new JSONObject(guardRaw);
            if (guard != null && (guard.length() != 2 || !validId(id(guard, "operationId")) || !validId(id(guard, "generatedPeerId"))))
                throw new IllegalStateException("identity_reset_native_metadata_invalid");
            if (receiptRaw != null) {
                JSONObject receipt = new JSONObject(receiptRaw);
                if (receipt.length() != 5 || guard == null || !id(receipt, "operationId").equals(id(guard, "operationId")) ||
                    !id(receipt, "receiptId").equals(id(receipt, "operationId")) ||
                    !id(receipt, "generatedPeerId").equals(id(guard, "generatedPeerId")) ||
                    !validId(id(receipt, "formerPeerId")) || id(receipt, "formerPeerId").equals(id(receipt, "generatedPeerId")) ||
                    !(receipt.get("completedAt") instanceof Number) || !Double.isFinite(receipt.getDouble("completedAt")))
                    throw new IllegalStateException("identity_reset_native_metadata_invalid");
            }
        } catch (Exception invalid) { throw new IllegalStateException("identity_reset_native_metadata_invalid"); }
    }

    private String id(JSONObject value, String key) throws Exception {
        Object field = value.get(key);
        if (!(field instanceof String)) throw new IllegalStateException("identity_reset_native_metadata_invalid");
        return (String) field;
    }

    private boolean validId(String value) { return !value.isEmpty() && value.length() <= 512 && value.trim().equals(value); }

    void requireOpen() {
        if (isBlocked()) throw new IllegalStateException("identity_reset_incomplete_retry_after_setup");
    }

    void acquire() {
        synchronized (LOCK) {
            String marker = persistence.get(MARKER);
            if (marker == null) {
                persistence.set(MARKER, "provisional");
            }
            else if (!"provisional".equals(marker) && !"sealed".equals(marker))
                throw new IllegalStateException("identity_reset_native_fence_invalid");
        }
    }

    void release() {
        synchronized (LOCK) {
            if (persistence.get(JOURNAL) != null || !"provisional".equals(persistence.get(MARKER)))
                throw new IllegalStateException("identity_reset_native_fence_sealed");
            persistence.remove(MARKER);
        }
    }

    void seal() {
        synchronized (LOCK) {
            if (!"sealed".equals(persistence.get(MARKER))) {
                generation = UUID.randomUUID().toString();
                persistence.set(MARKER, "sealed");
            }
        }
    }

    void clearQueues(Context context) {
        clearQueues(ClipContinuityPreferences.open(context));
        BackgroundContinuityDiagnostics diagnostics = new BackgroundContinuityDiagnostics(context);
        diagnostics.recordPendingActionCount(0);
        diagnostics.recordPendingApplication(false);
    }

    void clearQueues(DurableStringStore queues) {
        synchronized (LOCK) {
            if (cleanupUnconfirmed) throw new IllegalStateException("identity_reset_native_cleanup_unconfirmed");
            seal();
            cleanupUnconfirmed = true;
            if (!queues.remove("actions") || !queues.remove("pending_clipboard_application"))
                throw new IllegalStateException("identity_reset_native_cleanup_unconfirmed");
            cleanupUnconfirmed = false;
            verifyQueues(queues);
        }
    }

    void verifyQueues(Context context) { verifyQueues(ClipContinuityPreferences.open(context)); }

    void verifyQueues(DurableStringStore queues) {
        synchronized (LOCK) {
            if (cleanupUnconfirmed) throw new IllegalStateException("identity_reset_native_cleanup_unconfirmed");
            if (!"sealed".equals(persistence.get(MARKER)))
                throw new IllegalStateException("identity_reset_native_fence_required");
            if (queues.getString("actions", null) != null || queues.getString("pending_clipboard_application", null) != null)
                throw new IllegalStateException("identity_reset_native_cleanup_remaining");
        }
    }

    boolean isSealed() { synchronized (LOCK) { return "sealed".equals(persistence.get(MARKER)); } }

    void requireRestartReady(Context context) throws Exception {
        synchronized (LOCK) {
            if (persistence.get(JOURNAL) != null) throw new IllegalStateException("identity_reset_incomplete_retry_after_setup");
            requireValidMetadata();
            String marker = persistence.get(MARKER);
            if (marker == null) return; // Ordinary automatic rotation also rebuilds the Activity.
            if ("provisional".equals(marker)) return; // Conclusive nonacceptance: fresh startup rechecks before reopening.
            if (!"sealed".equals(marker)) throw new IllegalStateException("identity_reset_native_fence_invalid");
            requireCompletedIdentity();
            verifyQueues(context);
        }
    }

    private void requireCompletedIdentity() throws Exception {
        JSONObject completed = new JSONObject(persistence.get(PREFIX + "manualIdentityResetCompleted"));
        JSONObject identity = new JSONObject(persistence.get(PREFIX + "localDeviceIdentity"));
        if (!id(completed, "generatedPeerId").equals(id(identity, "deviceId")))
            throw new IllegalStateException("identity_reset_native_completion_mismatch");
    }

    /** Only a fresh bridge, after core startup reconciliation, can reopen native admission. */
    void openAfterReconciliation() throws Exception {
        synchronized (LOCK) {
            if (cleanupUnconfirmed) throw new IllegalStateException("identity_reset_native_cleanup_unconfirmed");
            if (persistence.get(JOURNAL) != null)
                throw new IllegalStateException("identity_reset_incomplete_retry_after_setup");
            requireValidMetadata();
            String marker = persistence.get(MARKER);
            if (marker == null) return;
            if ("sealed".equals(marker)) {
                requireCompletedIdentity();
            } else if (!"provisional".equals(marker)) {
                throw new IllegalStateException("identity_reset_native_fence_invalid");
            }
            persistence.remove(MARKER);
        }
    }
}
