package com.clipp.app;

import android.os.Bundle;
import android.content.Intent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile boolean activityOwnedRuntimeAvailable;

    public static boolean hasActivityOwnedRuntime() {
        return activityOwnedRuntimeAvailable;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundContinuityPlugin.class);
        super.onCreate(savedInstanceState);
        activityOwnedRuntimeAvailable = true;
    }

    @Override
    public void onDestroy() {
        activityOwnedRuntimeAvailable = false;
        if (isFinishing()) {
            stopService(new Intent(this, BackgroundContinuityService.class));
        }
        super.onDestroy();
    }
}
