package com.clipp.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Renewable relay credentials, encrypted with a non-exportable Android Keystore key. */
final class ManagedRelayCredentialStore {
    static final String PREFERENCES = "clipp_managed_relay_credentials";
    private static final String KEY_ALIAS = "clipp_managed_relay_credentials_v1";
    private final SharedPreferences preferences;

    ManagedRelayCredentialStore(Context context) {
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    String read(String endpoint) {
        String encoded = preferences.getString(endpoint, null);
        if (encoded == null) return null;
        try {
            String[] parts = encoded.split(":", -1);
            if (parts.length != 2) throw new IllegalArgumentException("invalid_ciphertext");
            byte[] nonce = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(parts[1], Base64.NO_WRAP);
            if (nonce.length != 12 || ciphertext.length < 17) throw new IllegalArgumentException("invalid_ciphertext");
            SecretKey key = existingKey();
            if (key == null) throw new IllegalStateException("missing_key");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(endpoint.getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception error) {
            // A restored ciphertext, invalidated key, or corrupt record never becomes a plaintext fallback.
            erase(endpoint);
            return null;
        }
    }

    void write(String endpoint, String credential) throws Exception {
        if (credential == null || credential.isEmpty()) throw new IllegalArgumentException("empty_credential");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, createOrLoadKey());
        cipher.updateAAD(endpoint.getBytes(StandardCharsets.UTF_8));
        String encoded = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
            + Base64.encodeToString(cipher.doFinal(credential.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!preferences.edit().putString(endpoint, encoded).commit()) throw new IllegalStateException("credential_save_failed");
    }

    void erase(String endpoint) {
        if (!preferences.edit().remove(endpoint).commit()) throw new IllegalStateException("credential_erase_failed");
    }

    private SecretKey existingKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }

    private SecretKey createOrLoadKey() throws Exception {
        SecretKey existing = existingKey();
        if (existing != null) return existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }
}
