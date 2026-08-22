package com.clipp.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Reboot never recreates a WebView or foreground service; it only offers an explicit reconnect. */
public final class BackgroundContinuityBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (BackgroundContinuityService.preferences(context).getBoolean(BackgroundContinuityService.ENABLED, false)) {
            BackgroundContinuityService.postReconnectNotification(context);
        }
    }
}
