package com.clipp.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.provider.Settings;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;
import android.view.View;
import android.view.ViewTreeObserver;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleOwner;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;
import java.util.UUID;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BackgroundContinuity")
public final class BackgroundContinuityPlugin extends Plugin {
    private static final long SERVICE_START_TIMEOUT_MS = 10_000L;
    private String runtimeGeneration;
    private boolean activityResumed;
    private boolean destroyed;
    private View observedActivityView;
    private final ViewTreeObserver.OnWindowFocusChangeListener activityFocusListener = focused -> notifyActivityState();
    private boolean admit(PluginCall call) {
        if (!NativeIdentityResetFence.generation().equals(runtimeGeneration) || NativeIdentityResetFence.forContext(getContext()).isBlocked()) {
            call.reject("identity_reset_incomplete_retry_after_setup");
            return false;
        }
        return true;
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile PluginCall pendingStartCall;
    private final Map<PluginCall, Runnable> pendingStops = new ConcurrentHashMap<>();
    private final Map<String, PluginCall> pendingUpdates = new ConcurrentHashMap<>();
    private final Map<String, Runnable> updateTimeouts = new ConcurrentHashMap<>();
    private final Runnable serviceStartTimeout = () -> {
        PluginCall call = takePendingStartCall();
        if (call != null) call.reject("background_continuity_start_timeout");
    };

    private final BroadcastReceiver eventReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (BackgroundContinuityService.ACTION_SERVICE_STOPPED.equals(intent.getAction())) {
                for (PluginCall call : new java.util.ArrayList<>(pendingStops.keySet())) {
                    handler.removeCallbacks(pendingStops.remove(call));
                    call.resolve();
                }
                return;
            }
            if (BackgroundContinuityService.ACTION_SERVICE_UPDATED.equals(intent.getAction())) {
                String id = intent.getStringExtra(BackgroundContinuityService.EXTRA_UPDATE_ID);
                PluginCall call = takePendingUpdate(id);
                if (call != null) call.resolve();
                return;
            }
            if (BackgroundContinuityService.ACTION_SERVICE_STARTED.equals(intent.getAction())) {
                PluginCall call = takePendingStartCall();
                if (call != null) call.resolve();
                return;
            }
            if (BackgroundContinuityService.ACTION_RUNTIME_LOST.equals(intent.getAction())) {
                rejectPendingUpdates("background_continuity_runtime_lost");
                notifyListeners("runtimeLost", new JSObject());
                return;
            }
            if (BackgroundContinuityService.ACTION_TASK_REMOVED.equals(intent.getAction())) {
                rejectPendingUpdates("background_continuity_task_removed");
                notifyListeners("taskRemoved", new JSObject());
                return;
            }
            if (BackgroundContinuityService.ACTION_NOTIFICATION_ACTION.equals(intent.getAction())) {
                if ("stop".equals(intent.getStringExtra(BackgroundContinuityService.EXTRA_ACTION))) {
                    rejectPendingUpdates("background_continuity_stopped");
                    PluginCall startCall = takePendingStartCall();
                    if (startCall != null) startCall.reject("background_continuity_stopped");
                }
                JSObject event = new JSObject();
                event.put("action", intent.getStringExtra(BackgroundContinuityService.EXTRA_ACTION));
                event.put("actionToken", intent.getStringExtra(BackgroundContinuityService.EXTRA_ACTION_TOKEN));
                notifyListeners("action", event, true);
                return;
            }
            if (ExplicitTextIngressStore.ACTION_EXPLICIT_TEXT_QUEUED.equals(intent.getAction())) {
                notifyListeners("explicitText", new JSObject(), true);
            }
        }
    };

    @Override
    public void load() {
        runtimeGeneration = NativeIdentityResetFence.generation();
        IntentFilter filter = new IntentFilter();
        filter.addAction(BackgroundContinuityService.ACTION_RUNTIME_LOST);
        filter.addAction(BackgroundContinuityService.ACTION_TASK_REMOVED);
        filter.addAction(BackgroundContinuityService.ACTION_NOTIFICATION_ACTION);
        filter.addAction(BackgroundContinuityService.ACTION_SERVICE_STARTED);
        filter.addAction(BackgroundContinuityService.ACTION_SERVICE_UPDATED);
        filter.addAction(BackgroundContinuityService.ACTION_SERVICE_STOPPED);
        filter.addAction(ExplicitTextIngressStore.ACTION_EXPLICIT_TEXT_QUEUED);
        ContextCompat.registerReceiver(getContext(), eventReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
        // A native dialog can take window focus without pausing this Activity or
        // delivering a WebView blur callback. Keep the existing JS eligibility
        // owner informed of the actual native transition, including lazy load.
        handler.post(() -> {
            if (destroyed || getActivity() == null) return;
            activityResumed = getActivity() instanceof LifecycleOwner
                && ((LifecycleOwner) getActivity()).getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED);
            observedActivityView = getActivity().getWindow().getDecorView();
            observedActivityView.getViewTreeObserver().addOnWindowFocusChangeListener(activityFocusListener);
            notifyActivityState();
        });
    }

    @Override
    protected void handleOnResume() {
        activityResumed = true;
        notifyActivityState();
    }

    @Override
    protected void handleOnPause() {
        activityResumed = false;
        notifyActivityState();
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        if (observedActivityView != null) {
            ViewTreeObserver observer = observedActivityView.getViewTreeObserver();
            if (observer.isAlive()) observer.removeOnWindowFocusChangeListener(activityFocusListener);
            observedActivityView = null;
        }
        PluginCall startCall = takePendingStartCall();
        if (startCall != null) startCall.reject("background_continuity_plugin_destroyed");
        rejectPendingUpdates("background_continuity_plugin_destroyed");
        for (PluginCall call : new java.util.ArrayList<>(pendingStops.keySet())) {
            handler.removeCallbacks(pendingStops.remove(call));
            call.reject("background_continuity_plugin_destroyed");
        }
        try {
            getContext().unregisterReceiver(eventReceiver);
        } catch (IllegalArgumentException ignored) {
            // The bridge can destroy an unloaded plugin during process teardown.
        }
    }

    @PluginMethod
    public void getPlatformInfo(PluginCall call) {
        BackgroundContinuityDiagnostics diagnostics = new BackgroundContinuityDiagnostics(getContext());
        boolean notificationsAvailable = BackgroundContinuityService.notificationsAvailable(getContext());
        diagnostics.recordNotificationAvailability(notificationsAvailable);
        JSObject result = new JSObject();
        result.put("apiLevel", Build.VERSION.SDK_INT);
        result.put("enabledPersistenceKnown", BackgroundContinuityService.enabledPersistenceKnown());
        result.put("enabled", BackgroundContinuityService.preferences(getContext()).getBoolean(BackgroundContinuityService.ENABLED, false));
        result.put("serviceRunning", BackgroundContinuityService.isRunning());
        result.put("actionToken", BackgroundContinuityService.currentActionToken());
        result.put("userStopped", BackgroundContinuityService.preferences(getContext()).getBoolean(BackgroundContinuityService.USER_STOPPED, false));
        result.put(
            "notificationAvailability",
            notificationsAvailable ? "available" : "blocked"
        );
        JSONObject diagnosticStatus = diagnostics.statusJson();
        result.put("observedBackgroundFailureCount", diagnosticStatus.optInt("observedBackgroundFailureCount"));
        result.put("supportState", diagnosticStatus.optString("supportState"));
        result.put("batteryOptimizationGuidance", diagnosticStatus.optBoolean("batteryOptimizationGuidance"));
        call.resolve(result);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        try {
            boolean enabled = call.getBoolean("enabled", false);
            synchronized (NativeIdentityResetFence.LOCK) {
                if (!admit(call)) return;
                if (!BackgroundContinuityService.persistEnabled(getContext(), enabled)) {
                    call.reject("background_continuity_persistence_failed"); return;
                }
            }
            if (!enabled) {
                rejectPendingUpdates("background_continuity_stopped");
                PluginCall startCall = takePendingStartCall();
                if (startCall != null) startCall.reject("background_continuity_stopped");
                stopAndResolve(call);
                return;
            }
            call.resolve();
        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    @PluginMethod
    public synchronized void start(PluginCall call) {
        try {
            if (!admit(call)) return;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                call.reject("background_continuity_unavailable");
                return;
            }
            if (!BackgroundContinuityService.preferences(getContext()).getBoolean(BackgroundContinuityService.ENABLED, false)) {
                call.reject("background_continuity_not_enabled");
                return;
            }
            if (pendingStartCall != null) {
                call.reject("background_continuity_start_in_progress");
                return;
            }
            pendingStartCall = call;
            new BackgroundContinuityDiagnostics(getContext()).recordServiceTransition(
                BackgroundContinuityDiagnostics.ServiceTransition.START_REQUESTED
            );
            handler.postDelayed(serviceStartTimeout, SERVICE_START_TIMEOUT_MS);
            try {
                Intent intent = new Intent(getContext(), BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_START)
                    .putExtra(BackgroundContinuityService.EXTRA_IDENTITY_RUNTIME_GENERATION, runtimeGeneration);
                Boolean autoSync = call.getBoolean("autoSync");
                if (autoSync != null) intent.putExtra(BackgroundContinuityService.EXTRA_AUTO_SYNC, autoSync);
                ContextCompat.startForegroundService(getContext(), intent);
            } catch (RuntimeException error) {
                PluginCall startCall = takePendingStartCall();
                if (startCall != null) startCall.reject("background_continuity_start_failed", error);
            }

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (!NativeIdentityResetFence.generation().equals(runtimeGeneration) && !NativeIdentityResetFence.forContext(getContext()).isBlocked()) {
            call.reject("identity_runtime_retired"); return;
        }
        new BackgroundContinuityDiagnostics(getContext()).recordServiceTransition(
            BackgroundContinuityDiagnostics.ServiceTransition.STOP_REQUESTED
        );
        PluginCall startCall = takePendingStartCall();
        if (startCall != null) startCall.reject("background_continuity_stopped");
        rejectPendingUpdates("background_continuity_stopped");
        stopAndResolve(call);
    }

    @PluginMethod
    public void heartbeat(PluginCall call) {
        try {
            if (!admit(call)) return;
            getContext().startService(new Intent(getContext(), BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_HEARTBEAT).putExtra(BackgroundContinuityService.EXTRA_IDENTITY_RUNTIME_GENERATION, runtimeGeneration));
            call.resolve();

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    @PluginMethod
    public void update(PluginCall call) {
        try {
            if (!admit(call)) return;
            if (!BackgroundContinuityService.isRunning()) { call.reject("background_continuity_not_running"); return; }
            String id = UUID.randomUUID().toString();
            Runnable timeout = () -> {
                PluginCall pending = takePendingUpdate(id);
                if (pending != null) pending.reject("background_continuity_update_timeout");
            };
            pendingUpdates.put(id, call);
            updateTimeouts.put(id, timeout);
            handler.postDelayed(timeout, SERVICE_START_TIMEOUT_MS);
            Intent intent = new Intent(getContext(), BackgroundContinuityService.class).setAction(BackgroundContinuityService.ACTION_UPDATE).putExtra(BackgroundContinuityService.EXTRA_IDENTITY_RUNTIME_GENERATION, runtimeGeneration);
            intent.putExtra(BackgroundContinuityService.EXTRA_CONNECTION_STATE, call.getString("state", "waiting"));
            intent.putExtra(BackgroundContinuityService.EXTRA_CONNECTED_DEVICE_COUNT, call.getInt("connectedTrustedDeviceCount", 0));
            Boolean autoSync = call.getBoolean("autoSync");
            if (autoSync != null) intent.putExtra(BackgroundContinuityService.EXTRA_AUTO_SYNC, autoSync);
            intent.putExtra(BackgroundContinuityService.EXTRA_UPDATE_ID, id);
            try { getContext().startService(intent); }
            catch (RuntimeException error) {
                PluginCall pending = takePendingUpdate(id);
                if (pending != null) pending.reject("background_continuity_update_failed", error);
            }

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        if (getActivity() == null) { call.reject("notification_settings_activity_unavailable"); return; }
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()));
            call.resolve();
        } catch (RuntimeException error) { call.reject("notification_settings_unavailable", error); }
    }

    @PluginMethod
    public void showControlFeedback(PluginCall call) {
        if (getActivity() == null) { call.reject("background_feedback_activity_unavailable"); return; }
        String message = call.getString("message", "The action could not be confirmed. Reopen Clipp.");
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), message, Toast.LENGTH_LONG).show());
        call.resolve();
    }

    @PluginMethod
    public void showReconnectNotification(PluginCall call) {
        try {
            if (!admit(call)) return;
            BackgroundContinuityService.postReconnectNotification(getContext());
            call.resolve();

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    @PluginMethod
    public void exportDiagnostics(PluginCall call) {
        if (getActivity() == null) {
            call.reject("diagnostic_export_activity_unavailable");
            return;
        }
        try {
            File export = writeDiagnosticsExport(getContext());
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", export);
            Intent share = new Intent(Intent.ACTION_SEND)
                .setType("application/json")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(share, "Export Clipp diagnostics"));
            call.resolve();
        } catch (Exception error) {
            call.reject("diagnostic_export_failed", error);
        }
    }

    static File writeDiagnosticsExport(Context context) throws Exception {
        BackgroundContinuityDiagnostics diagnostics = new BackgroundContinuityDiagnostics(context);
        diagnostics.recordEnvironmentSnapshot();
        File directory = new File(context.getCacheDir(), "diagnostics");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("diagnostic_export_directory_unavailable");
        }
        File export = new File(directory, "clipp-background-continuity.json");
        File[] priorExports = directory.listFiles((parent, name) ->
            name.startsWith("clipp-background-continuity") && name.endsWith(".json")
        );
        if (priorExports != null) {
            for (File prior : priorExports) {
                if (!prior.equals(export) && !prior.delete()) {
                    throw new IllegalStateException("diagnostic_export_retention_failed");
                }
            }
        }
        try (FileOutputStream output = new FileOutputStream(export, false)) {
            output.write(diagnostics.exportJson().getBytes(StandardCharsets.UTF_8));
        }
        return export;
    }

    @PluginMethod
    public void getExplicitTextActions(PluginCall call) {
        try {
            if (!admit(call)) return;
            JSObject result = new JSObject();
            result.put("actions", new ExplicitTextIngressStore(getContext()).actionsJson());
            call.resolve(result);

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    /** Passive OS permission state only; never requests permission or opens capture. */
    @PluginMethod
    public void getCameraPermission(PluginCall call) {
        String state = "unknown";
        try {
            state = ContextCompat.checkSelfPermission(getContext(), android.Manifest.permission.CAMERA)
                == android.content.pm.PackageManager.PERMISSION_GRANTED ? "granted" : "denied";
        } catch (Exception ignored) { }
        JSObject result = new JSObject();
        result.put("state", state);
        call.resolve(result);
    }

    @PluginMethod
    public void prepareExplicitTextAction(PluginCall call) {
        try {
            if (!admit(call)) return;
            String actionId = call.getString("actionId");
            String clipId = call.getString("clipId");
            Long capturedAt = safeInteger(call, "capturedAt");
            Long sharingLifetimeMs = safeInteger(call, "sharingLifetimeMs");
            if (actionId == null || clipId == null || capturedAt == null || sharingLifetimeMs == null || sharingLifetimeMs <= 0 || sharingLifetimeMs > 2592000000L) {
                call.reject("invalid_explicit_text_action");
                return;
            }
            if (!new ExplicitTextIngressStore(getContext()).prepare(actionId, clipId, capturedAt, sharingLifetimeMs)) {
                call.reject("explicit_text_action_persistence_failed");
                return;
            }
            call.resolve();

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    private static Long safeInteger(PluginCall call, String name) {
        // JSON uses Integer, Long or Double depending on the number's magnitude.
        // Capacitor's getLong accepts only Long; retain the JS numeric contract
        // without coercing strings, fractions, non-finite or unsafe values.
        Object raw = call.getData().opt(name);
        if (!(raw instanceof Number)) return null;
        double value = ((Number) raw).doubleValue();
        if (!Double.isFinite(value) || value != Math.rint(value)
            || Math.abs(value) > 9007199254740991d) return null;
        return (long) value;
    }

    @PluginMethod
    public void completeExplicitTextAction(PluginCall call) {
        try {
            if (!admit(call)) return;
            String actionId = call.getString("actionId");
            if (actionId == null || !new ExplicitTextIngressStore(getContext()).complete(actionId)) {
                call.reject("explicit_text_action_completion_failed");
                return;
            }
            call.resolve();

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    @PluginMethod
    public void showExplicitTextFeedback(PluginCall call) {
        String state = call.getString("state", "failed");
        int message = "accepted".equals(state)
            ? R.string.explicit_text_accepted
            : ("queued".equals(state) ? R.string.explicit_text_queued : R.string.explicit_text_failed);
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show());
        call.resolve();
    }

    @PluginMethod
    public void getPendingClipboardApplication(PluginCall call) {
        try {
            if (!admit(call)) return;
            JSObject result = new JSObject();
            result.put("clipId", new PendingClipboardApplicationStore(getContext()).read());
            call.resolve(result);

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    @PluginMethod
    public void setPendingClipboardApplication(PluginCall call) {
        try {
            if (!admit(call)) return;
            String clipId = call.getString("clipId");
            if (clipId == null || !new PendingClipboardApplicationStore(getContext()).write(clipId)) {
                call.reject("pending_clipboard_application_persistence_failed");
                return;
            }
            call.resolve();

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    @PluginMethod
    public void clearPendingClipboardApplication(PluginCall call) {
        try {
            if (!admit(call)) return;
            if (!new PendingClipboardApplicationStore(getContext()).clear()) {
                call.reject("pending_clipboard_application_clear_failed");
                return;
            }
            call.resolve();

        } catch (Exception error) { call.reject("identity_reset_native_operation_unavailable"); }
    }

    private void notifyActivityState() {
        if (destroyed) return;
        boolean focused = getActivity() != null && getActivity().getWindow().getDecorView().hasWindowFocus();
        boolean captureEligible = activityResumed && focused;
        new BackgroundContinuityDiagnostics(getContext()).recordCaptureEligibility(captureEligible);
        JSObject event = new JSObject();
        event.put("resumed", activityResumed);
        event.put("windowFocused", focused);
        notifyListeners("activityState", event, true);
    }

    private void stopAndResolve(PluginCall call) {
        if (!BackgroundContinuityService.isRunning()) {
            getContext().stopService(new Intent(getContext(), BackgroundContinuityService.class));
            call.resolve();
            return;
        }
        Runnable timeout = () -> {
            if (pendingStops.remove(call) != null) call.reject("background_continuity_stop_timeout");
        };
        pendingStops.put(call, timeout);
        handler.postDelayed(timeout, SERVICE_START_TIMEOUT_MS);
        try { getContext().stopService(new Intent(getContext(), BackgroundContinuityService.class)); }
        catch (RuntimeException error) {
            handler.removeCallbacks(pendingStops.remove(call));
            call.reject("background_continuity_stop_failed", error);
        }
    }

    private PluginCall takePendingUpdate(String id) {
        Runnable timeout = updateTimeouts.remove(id);
        if (timeout != null) handler.removeCallbacks(timeout);
        return pendingUpdates.remove(id);
    }

    private void rejectPendingUpdates(String reason) {
        for (String id : new java.util.ArrayList<>(pendingUpdates.keySet())) {
            PluginCall call = takePendingUpdate(id);
            if (call != null) call.reject(reason);
        }
    }

    private synchronized PluginCall takePendingStartCall() {
        handler.removeCallbacks(serviceStartTimeout);
        PluginCall call = pendingStartCall;
        pendingStartCall = null;
        return call;
    }
}
