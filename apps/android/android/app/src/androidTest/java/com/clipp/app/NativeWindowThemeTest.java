package com.clipp.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.res.Resources;
import android.content.res.TypedArray;
import android.view.Window;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Ordinary Activity/resource consumers; no ActionBar getter can create the state under test. */
@RunWith(AndroidJUnit4.class)
public final class NativeWindowThemeTest {
    @Test
    public void ordinaryWorkspaceHasNoNativeTitleBarAtLaunchAndAfterRecreate() throws Exception {
        Assume.assumeTrue("Root must assign the native window-theme interval",
            "true".equals(InstrumentationRegistry.getArguments().getString("nativeWindowThemeAcceptance")));
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NativeAcceptanceTarget.requireIsolated(target.getPackageName());

        ActivityInfo main = target.getPackageManager().getActivityInfo(new ComponentName(target, MainActivity.class), 0);
        Resources.Theme launch = target.getResources().newTheme();
        launch.applyStyle(main.getThemeResource(), true);
        assertNoActionBarAttributes("Manifest launch", launch);

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(NativeWindowThemeTest::assertOrdinaryWindow);
            scenario.recreate();
            scenario.onActivity(NativeWindowThemeTest::assertOrdinaryWindow);
        }
    }

    private static void assertOrdinaryWindow(MainActivity activity) {
        assertNoActionBarAttributes("Ordinary runtime", activity.getTheme());
        Window window = activity.getWindow();
        assertNotNull(window.peekDecorView());
        assertNotNull(activity.getBridge().getWebView());
        assertFalse("Framework toolbar must not cover the HTML workspace", window.hasFeature(Window.FEATURE_ACTION_BAR));
        assertTrue("Framework window has no native title", window.hasFeature(Window.FEATURE_NO_TITLE));
    }

    private static void assertNoActionBarAttributes(String stage, Resources.Theme theme) {
        TypedArray values = theme.obtainStyledAttributes(new int[]{
            android.R.attr.windowActionBar, android.R.attr.windowNoTitle,
            androidx.appcompat.R.attr.windowActionBar, androidx.appcompat.R.attr.windowNoTitle
        });
        try {
            for (int index = 0; index < 4; index++) assertTrue(stage + " resolves each window policy", values.hasValue(index));
            assertFalse(stage + " disables the framework bar", values.getBoolean(0, true));
            assertTrue(stage + " removes the framework title", values.getBoolean(1, false));
            assertFalse(stage + " disables the AppCompat bar", values.getBoolean(2, true));
            assertTrue(stage + " removes the AppCompat title", values.getBoolean(3, false));
        } finally {
            values.recycle();
        }
    }
}
