package com.clipp.app;

import android.os.Bundle;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

/** Acceptance-only native platform control. No Capacitor, JS or application state. */
public final class RootBackControlActivity extends AppCompatActivity {
    @Override public void onCreate(Bundle state) {
        if (!"com.clipp.app.acceptance".equals(getPackageName())
            || !getIntent().getBooleanExtra("rootBackControlAcceptance", false))
            throw new SecurityException("Root Back control requires isolated acceptance and explicit root opt-in");
        super.onCreate(state);
        setTheme(R.style.AppTheme_NoActionBar);
        TextView label = new TextView(this);
        label.setText("Clipp native root Back control");
        setContentView(label);
        if (getIntent().getBooleanExtra("delegateBack", false)) {
            getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
                @Override public void handleOnBackPressed() {
                    setEnabled(false);
                    try { getOnBackPressedDispatcher().onBackPressed(); }
                    finally { setEnabled(true); }
                }
            });
        }
    }
}
