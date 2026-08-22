package com.clipp.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Reboot never recreates a WebView or foreground service; it only offers an explicit reconnect. */
public final class BackgroundContinuityBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        BackgroundContinuityDiagnostics diagnostics = new BackgroundContinuityDiagnostics(context);
        diagnostics.recordLifecycleTransition("boot_completed");
        diagnostics.recordEnvironmentSnapshot();
        if (BackgroundContinuityService.preferences(context).getBoolean(BackgroundContinuityService.ENABLED, false)) {
            diagnostics.recordLifecycleTransition("boot_reconnect_offered");
            BackgroundContinuityService.postReconnectNotification(context);
        }
    }
}
