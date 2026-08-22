package com.clipp.app;

import static org.junit.Assert.assertEquals;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class BackgroundContinuityManifestTest {
    @Test
    public void taskRemovalIsDeliveredToBackgroundContinuityService() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ServiceInfo service = context.getPackageManager().getServiceInfo(
            new ComponentName(context, BackgroundContinuityService.class),
            PackageManager.GET_META_DATA
        );

        assertEquals(0, service.flags & ServiceInfo.FLAG_STOP_WITH_TASK);
    }
}
