package com.clipp.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.app.ActivityManager;
import android.app.Instrumentation;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleEventObserver;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Diagnostic comparison only; never substitutes for production MainActivity Back. */
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 31)
public final class RootBackControlInputTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    @Before public void requireExplicitIsolatedNativeControl() {
        NativeAcceptanceTarget.requireIsolated(instrumentation.getTargetContext().getPackageName());
        Assume.assumeTrue("Root must authorize the native interval", "true".equals(InstrumentationRegistry.getArguments().getString("hostTaskInputAcceptance")));
        Assume.assumeTrue("Root must additionally authorize the diagnostic control", "true".equals(InstrumentationRegistry.getArguments().getString("rootBackControlAcceptance")));
    }

    @Test public void recordsUnmodifiedAppCompatLauncherRootBackOutcome() { observe(false); }
    @Test public void recordsPassthroughAppCompatLauncherRootBackOutcome() { observe(true); }

    private void observe(boolean delegate) {
        Context target = instrumentation.getTargetContext();
        Intent launch = Intent.makeMainActivity(new ComponentName(target.getPackageName(), "com.clipp.app.RootBackControlActivity"))
            .putExtra("rootBackControlAcceptance", true).putExtra("delegateBack", delegate);
        try (ActivityScenario<AppCompatActivity> scenario = ActivityScenario.launch(launch)) {
            AtomicBoolean focused = new AtomicBoolean(), finishing = new AtomicBoolean();
            long deadline = SystemClock.uptimeMillis() + 20_000;
            do {
                scenario.onActivity(activity -> focused.set(activity.hasWindowFocus()));
                if (scenario.getState() == Lifecycle.State.RESUMED && focused.get()) break;
                SystemClock.sleep(50);
            } while (SystemClock.uptimeMillis() < deadline);
            assertTrue("Actual native control must be resumed and focused", scenario.getState() == Lifecycle.State.RESUMED && focused.get());
            AtomicInteger pauses = new AtomicInteger(), stops = new AtomicInteger(), destroys = new AtomicInteger();
            LifecycleEventObserver observer = (owner, event) -> {
                finishing.set(((AppCompatActivity) owner).isFinishing());
                if (event == Lifecycle.Event.ON_PAUSE) pauses.incrementAndGet();
                if (event == Lifecycle.Event.ON_STOP) stops.incrementAndGet();
                if (event == Lifecycle.Event.ON_DESTROY) destroys.incrementAndGet();
            };
            scenario.onActivity(activity -> {
                assertEquals(Intent.ACTION_MAIN, activity.getIntent().getAction());
                assertTrue(activity.getIntent().hasCategory(Intent.CATEGORY_LAUNCHER));
                assertTrue(activity.isTaskRoot());
                ActivityManager manager = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
                for (ActivityManager.AppTask task : manager.getAppTasks()) {
                    ActivityManager.RecentTaskInfo info = task.getTaskInfo();
                    if (info.taskId == activity.getTaskId())
                        Log.i("ClippRootBackControl", "before;delegate=" + delegate + ";task=" + info.taskId + ";baseActivity=" + info.baseActivity
                            + ";baseComponent=" + (info.baseIntent == null ? "unavailable" : info.baseIntent.getComponent()) + ";top=" + info.topActivity + ";count=" + info.numActivities);
                }
                activity.getLifecycle().addObserver(observer);
            });
            // Exactly one genuine native key; no direct dispatcher call from the test.
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            instrumentation.waitForIdleSync();
            deadline = SystemClock.uptimeMillis() + 20_000;
            while ((stops.get() == 0 || (finishing.get() && destroys.get() == 0)) && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(50);
            assertEquals("One real key pauses the native control once", 1, pauses.get());
            assertEquals("One real key stops the native control once", 1, stops.get());
            assertTrue("One key must not duplicate destruction", destroys.get() <= 1);
            assertTrue("A requested native finish must settle before recording its outcome", !finishing.get() || destroys.get() == 1);
            Log.i("ClippRootBackControl", "outcome;diagnosticOnly=true;delegate=" + delegate + ";keys=1;pauses=" + pauses.get()
                + ";stops=" + stops.get() + ";destroys=" + destroys.get() + ";finishing=" + finishing.get() + ";state=" + scenario.getState());
            if (scenario.getState() != Lifecycle.State.DESTROYED)
                scenario.onActivity(activity -> activity.getLifecycle().removeObserver(observer));
        }
    }
}
