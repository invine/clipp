package com.clipp.app;

import android.os.Bundle;
import android.content.Intent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundContinuityPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onDestroy() {
        if (isFinishing()) {
            stopService(new Intent(this, BackgroundContinuityService.class));
        }
        super.onDestroy();
    }
}
