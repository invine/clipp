package com.clipp.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.ServerPath;

/** Explicit acceptance build only: no Clipp client, clipboard capture, ingress or network services. */
public final class IdentityResetAcceptanceActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (!"com.clipp.app.acceptance".equals(getPackageName()))
            throw new IllegalStateException("Identity reset fixture refuses operator application");
        // Capacitor debug logging includes plugin payloads; synthetic private keys stay out of diagnostics.
        config = new CapConfig.Builder(this).setLoggingEnabled(false).setWebContentsDebuggingEnabled(false)
            .setInitialFocus(false).create();
        registerPlugin(IdentityResetStoragePlugin.class);
        bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.ASSET_PATH, "identity-reset-acceptance"));
        super.onCreate(savedInstanceState);
    }
}
