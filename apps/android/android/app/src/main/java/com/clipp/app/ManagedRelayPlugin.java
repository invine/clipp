package com.clipp.app;

import android.content.Intent;
import android.net.Uri;

import androidx.browser.customtabs.CustomTabsIntent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "ManagedRelay")
public final class ManagedRelayPlugin extends Plugin {
    static final String REDIRECT = "clipp-relay://oauth/callback";
    private ManagedRelayCredentialStore credentials;

    @Override
    public void load() {
        credentials = new ManagedRelayCredentialStore(getContext());
    }

    @PluginMethod
    public void readCredential(PluginCall call) {
        String endpoint = call.getString("discoveryUrl");
        if (!validEndpoint(endpoint, call)) return;
        try {
            JSObject result = new JSObject();
            result.put("credential", credentials.read(endpoint));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("credential_read_failed", error);
        }
    }

    @PluginMethod
    public void writeCredential(PluginCall call) {
        String endpoint = call.getString("discoveryUrl");
        String credential = call.getString("credential");
        if (!validEndpoint(endpoint, call)) return;
        try {
            credentials.write(endpoint, credential);
            call.resolve();
        } catch (Exception error) {
            call.reject("credential_save_failed", error);
        }
    }

    @PluginMethod
    public void eraseCredential(PluginCall call) {
        String endpoint = call.getString("discoveryUrl");
        if (!validEndpoint(endpoint, call)) return;
        try {
            credentials.erase(endpoint);
            call.resolve();
        } catch (Exception error) {
            call.reject("credential_erase_failed", error);
        }
    }

    @PluginMethod
    public void openBrowser(PluginCall call) {
        String value = call.getString("url");
        Uri uri = value == null ? null : Uri.parse(value);
        if (uri == null || !"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
            call.reject("invalid_browser_url");
            return;
        }
        try {
            new CustomTabsIntent.Builder().build().launchUrl(getActivity(), uri);
            call.resolve();
        } catch (Exception error) {
            call.reject("custom_tab_unavailable", error);
        }
    }

    @PluginMethod
    public void postToken(PluginCall call) {
        String endpoint = call.getString("discoveryUrl");
        String form = call.getString("form");
        if (!validEndpoint(endpoint, call)) return;
        if (form == null || form.length() > 4096) { call.reject("invalid_token_form"); return; }
        getBridge().execute(() -> exchange(call, endpoint, "/oauth/token", "POST", form, null));
    }

    @PluginMethod
    public void getDiscovery(PluginCall call) {
        String endpoint = call.getString("discoveryUrl");
        String token = call.getString("accessToken");
        if (!validEndpoint(endpoint, call)) return;
        if (token == null || token.isEmpty() || token.contains("\r") || token.contains("\n")) {
            call.reject("invalid_access_token"); return;
        }
        getBridge().execute(() -> exchange(call, endpoint, "/v1/relay", "GET", null, token));
    }

    private void exchange(PluginCall call, String endpoint, String path, String method, String form, String token) {
        HttpURLConnection connection = null;
        try {
            Uri original = Uri.parse(endpoint);
            URL url = new URL("https", original.getHost(), original.getPort(), path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (form != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                byte[] bytes = form.getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new IllegalStateException("redirect_refused");
            InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            ByteArrayOutputStream bounded = new ByteArrayOutputStream();
            if (input != null) {
                try (InputStream stream = input) {
                    byte[] chunk = new byte[2048];
                    int count;
                    while ((count = stream.read(chunk)) != -1) {
                        if (bounded.size() + count > 16_384) throw new IllegalStateException("relay_response_too_large");
                        bounded.write(chunk, 0, count);
                    }
                }
            }
            JSObject result = new JSObject();
            result.put("status", status);
            result.put("body", bounded.toString(StandardCharsets.UTF_8.name()));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("relay_http_failed", error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null || !REDIRECT.equals(uri.getScheme() + "://" + uri.getAuthority() + uri.getPath())) return;
        JSObject event = new JSObject();
        event.put("url", uri.toString());
        notifyListeners("oauthCallback", event, true);
    }

    private boolean validEndpoint(String value, PluginCall call) {
        Uri uri = value == null ? null : Uri.parse(value);
        if (uri == null || !"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
            || !"/v1/relay".equals(uri.getPath()) || uri.getQuery() != null || uri.getFragment() != null) {
            call.reject("invalid_discovery_url");
            return false;
        }
        return true;
    }
}
