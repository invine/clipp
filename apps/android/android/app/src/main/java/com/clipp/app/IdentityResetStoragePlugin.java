package com.clipp.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Strict companion to Preferences. Preferences' apply() is not a reset durability acknowledgement. */
@CapacitorPlugin(name = "IdentityResetStorage")
public final class IdentityResetStoragePlugin extends Plugin {
    // Matches @capacitor/preferences PreferencesConfiguration.DEFAULTS; Clipp never configure()s a group.
    private static final String GROUP = "CapacitorStorage";
    private static IdentityResetPersistence persistence;

    private synchronized IdentityResetPersistence persistence() {
        synchronized (IdentityResetStoragePlugin.class) {
            if (persistence == null) {
                SharedPreferences preferences = getContext().getSharedPreferences(GROUP, Context.MODE_PRIVATE);
                persistence = new IdentityResetPersistence(new IdentityResetPersistence.Store() {
                    public String get(String key) { return preferences.getString(key, null); }
                    public boolean commit(String key, String value) {
                        SharedPreferences.Editor editor = preferences.edit();
                        if (value == null) editor.remove(key); else editor.putString(key, value);
                        return editor.commit();
                    }
                });
            }
            return persistence;
        }
    }

    private String key(PluginCall call) {
        String key = call.getString("key");
        if (key == null || !key.startsWith("clipp-android:") || key.length() <= "clipp-android:".length())
            throw new IllegalArgumentException("invalid_identity_reset_key");
        return key;
    }

    @PluginMethod
    public void get(PluginCall call) {
        try {
            String value = persistence().get(key(call));
            JSObject result = new JSObject();
            result.put("value", value == null ? org.json.JSONObject.NULL : value);
            call.resolve(result);
        } catch (Exception error) { call.reject("identity_reset_storage_unavailable"); }
    }

    @PluginMethod
    public void set(PluginCall call) {
        try {
            String value = call.getString("value");
            if (value == null) throw new IllegalArgumentException("missing_identity_reset_value");
            persistence().set(key(call), value);
            call.resolve();
        } catch (Exception error) { call.reject("identity_reset_storage_unavailable"); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        try {
            persistence().remove(key(call));
            call.resolve();
        } catch (Exception error) { call.reject("identity_reset_storage_unavailable"); }
    }
}
