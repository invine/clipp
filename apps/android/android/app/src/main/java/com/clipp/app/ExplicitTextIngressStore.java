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
    static final String ACTION_EXPLICIT_TEXT_QUEUED = "com.clipp.app.EXPLICIT_TEXT_QUEUED";
    private static final String ACTIONS = "actions";
    private static final int MAX_TEXT_BYTES = 255 * 1024;
    private static final Object ACTION_QUEUE_LOCK = new Object();

    enum EnqueueResult {
        QUEUED,
        INVALID,
        PERSISTENCE_FAILED
    }

    private final DurableStringStore persistence;

    ExplicitTextIngressStore(Context context) {
        this(ClipContinuityPreferences.open(context));
    }

    ExplicitTextIngressStore(SharedPreferences preferences) {
        this(new SharedPreferencesDurableStringStore(preferences));
    }

    ExplicitTextIngressStore(DurableStringStore persistence) {
        this.persistence = persistence;
    }

    EnqueueResult enqueue(Intent intent) {
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

        synchronized (ACTION_QUEUE_LOCK) {
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
    }

    String actionsJson() {
        synchronized (ACTION_QUEUE_LOCK) {
            return readActions().toString();
        }
    }

    boolean prepare(String actionId, String clipId, long capturedAt) {
        synchronized (ACTION_QUEUE_LOCK) {
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
    }

    boolean complete(String actionId) {
        synchronized (ACTION_QUEUE_LOCK) {
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
