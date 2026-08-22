package com.clipp.app;

import android.content.Context;
import android.content.SharedPreferences;

interface DurableStringStore {
    String getString(String key, String fallback);
    boolean putString(String key, String value);
    boolean remove(String key);
}

final class ClipContinuityPreferences {
    static final String NAME = "clipp_explicit_text_ingress";

    private ClipContinuityPreferences() {}

    static DurableStringStore open(Context context) {
        return new SharedPreferencesDurableStringStore(
            context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
        );
    }
}

final class SharedPreferencesDurableStringStore implements DurableStringStore {
    private final SharedPreferences preferences;

    SharedPreferencesDurableStringStore(SharedPreferences preferences) {
        this.preferences = preferences;
    }

    @Override
    public String getString(String key, String fallback) {
        return preferences.getString(key, fallback);
    }

    @Override
    public boolean putString(String key, String value) {
        return preferences.edit().putString(key, value).commit();
    }

    @Override
    public boolean remove(String key) {
        return preferences.edit().remove(key).commit();
    }
}
