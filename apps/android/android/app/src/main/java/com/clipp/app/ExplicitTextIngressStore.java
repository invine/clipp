package com.clipp.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

final class ExplicitTextIngressStore {
    static final String PREFERENCES = "clipp_explicit_text_ingress";
    static final String ACTION_EXPLICIT_TEXT_QUEUED = "com.clipp.app.EXPLICIT_TEXT_QUEUED";
    private static final String ACTIONS = "actions";
    private static final String PENDING_CLIPBOARD_APPLICATION = "pending_clipboard_application";
    private static final int MAX_TEXT_BYTES = 255 * 1024;

    enum EnqueueResult {
        QUEUED,
        INVALID,
        PERSISTENCE_FAILED
    }

    interface Persistence {
        String getString(String key, String fallback);
        boolean putString(String key, String value);
        boolean remove(String key);
    }

    private final Persistence persistence;

    ExplicitTextIngressStore(Context context) {
        this(context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE));
    }

    ExplicitTextIngressStore(SharedPreferences preferences) {
        this(new Persistence() {
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
        });
    }

    ExplicitTextIngressStore(Persistence persistence) {
        this.persistence = persistence;
    }

    synchronized EnqueueResult enqueue(Intent intent) {
        String source;
        CharSequence supplied;
        if (!"text/plain".equals(intent.getType())) return EnqueueResult.INVALID;
        if (Intent.ACTION_PROCESS_TEXT.equals(intent.getAction())) {
            source = "process-text";
            supplied = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
        } else if (Intent.ACTION_SEND.equals(intent.getAction())) {
            source = "send";
            supplied = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        } else {
            return EnqueueResult.INVALID;
        }

        if (supplied == null) return EnqueueResult.INVALID;
        String text = supplied.toString();
        if (text.isEmpty() || text.getBytes(StandardCharsets.UTF_8).length > MAX_TEXT_BYTES) {
            return EnqueueResult.INVALID;
        }

        try {
            JSONArray actions = readActions();
            JSONObject action = new JSONObject();
            action.put("id", UUID.randomUUID().toString());
            action.put("text", text);
            action.put("source", source);
            actions.put(action);
            return persistence.putString(ACTIONS, actions.toString())
                ? EnqueueResult.QUEUED
                : EnqueueResult.PERSISTENCE_FAILED;
        } catch (JSONException error) {
            return EnqueueResult.PERSISTENCE_FAILED;
        }
    }

    synchronized String actionsJson() {
        return readActions().toString();
    }

    synchronized boolean prepare(String actionId, String clipId, long capturedAt) {
        JSONArray actions = readActions();
        try {
            for (int index = 0; index < actions.length(); index += 1) {
                JSONObject action = actions.getJSONObject(index);
                if (!actionId.equals(action.optString("id"))) continue;
                JSONObject event = new JSONObject();
                event.put("clipId", clipId);
                event.put("capturedAt", capturedAt);
                action.put("event", event);
                return persistence.putString(ACTIONS, actions.toString());
            }
        } catch (JSONException ignored) {
            return false;
        }
        return false;
    }

    synchronized boolean complete(String actionId) {
        JSONArray actions = readActions();
        JSONArray remaining = new JSONArray();
        boolean found = false;
        for (int index = 0; index < actions.length(); index += 1) {
            JSONObject action = actions.optJSONObject(index);
            if (action == null) continue;
            if (actionId.equals(action.optString("id"))) {
                found = true;
            } else {
                remaining.put(action);
            }
        }
        return found && persistence.putString(ACTIONS, remaining.toString());
    }

    synchronized String pendingClipboardApplication() {
        return persistence.getString(PENDING_CLIPBOARD_APPLICATION, null);
    }

    synchronized boolean writePendingClipboardApplication(String clipId) {
        return persistence.putString(PENDING_CLIPBOARD_APPLICATION, clipId);
    }

    synchronized boolean clearPendingClipboardApplication() {
        return persistence.remove(PENDING_CLIPBOARD_APPLICATION);
    }

    private JSONArray readActions() {
        String raw = persistence.getString(ACTIONS, "[]");
        try {
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }
}
