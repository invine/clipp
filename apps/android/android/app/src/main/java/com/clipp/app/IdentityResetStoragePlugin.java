package com.clipp.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Strict companion to Preferences. Preferences' apply() is not a reset durability acknowledgement. */
@CapacitorPlugin(name = "IdentityResetStorage")
public final class IdentityResetStoragePlugin extends Plugin {
    private IdentityResetPersistence persistence() {
        return IdentityResetPersistence.forContext(getContext());
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
