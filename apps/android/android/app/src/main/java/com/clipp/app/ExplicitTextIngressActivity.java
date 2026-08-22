package com.clipp.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

public final class ExplicitTextIngressActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ExplicitTextIngressStore.EnqueueResult result = new ExplicitTextIngressStore(this).enqueue(getIntent());
        if (result == ExplicitTextIngressStore.EnqueueResult.QUEUED) {
            Toast.makeText(this, R.string.explicit_text_queued, Toast.LENGTH_SHORT).show();
            sendBroadcast(new Intent(ExplicitTextIngressStore.ACTION_EXPLICIT_TEXT_QUEUED).setPackage(getPackageName()));
            Intent launch = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(launch);
        } else {
            Toast.makeText(this, R.string.explicit_text_failed, Toast.LENGTH_SHORT).show();
        }
        finish();
    }
}
