package com.clipp.app;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.xmlpull.v1.XmlPullParser;

import java.security.KeyStore;

@RunWith(AndroidJUnit4.class)
public class ManagedRelayCredentialStoreTest {
    private static final String ENDPOINT = "https://relay.example/v1/relay";

    @Test
    public void onlyExactPrivateCallbackResolvesToClipp() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(resolvesCallback(context, "clipp-relay://oauth/callback?code=x&state=y"));
        assertFalse(resolvesCallback(context, "clipp-relay://oauth/other?code=x&state=y"));
        assertFalse(resolvesCallback(context, "clipp-relay://elsewhere/callback?code=x&state=y"));
    }

    private boolean resolvesCallback(Context context, String value) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(value));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage(context.getPackageName());
        return !context.getPackageManager().queryIntentActivities(intent, 0).isEmpty();
    }

    @Test
    public void ciphertextIsAuthenticatedAndCorruptionRequiresLogin() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ManagedRelayCredentialStore store = new ManagedRelayCredentialStore(context);
        SharedPreferences preferences = context.getSharedPreferences(ManagedRelayCredentialStore.PREFERENCES, Context.MODE_PRIVATE);
        store.erase(ENDPOINT);
        store.write(ENDPOINT, "renewable-secret");
        String ciphertext = preferences.getString(ENDPOINT, null);
        assertNotNull(ciphertext);
        assertFalse(ciphertext.contains("renewable-secret"));
        assertEquals("renewable-secret", store.read(ENDPOINT));

        String other = "https://other.example/v1/relay";
        preferences.edit().putString(other, ciphertext).commit();
        assertNull(store.read(other));
        assertFalse(preferences.contains(other));
        assertEquals("renewable-secret", store.read(ENDPOINT));

        String[] parts = ciphertext.split(":", -1);
        byte[] altered = Base64.decode(parts[1], Base64.NO_WRAP);
        altered[altered.length - 1] ^= 1;
        preferences.edit().putString(ENDPOINT, parts[0] + ":" + Base64.encodeToString(altered, Base64.NO_WRAP)).commit();
        assertNull(store.read(ENDPOINT));
        assertFalse(preferences.contains(ENDPOINT));
    }

    @Test
    public void missingKeystoreKeyErasesRestoredCiphertext() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ManagedRelayCredentialStore store = new ManagedRelayCredentialStore(context);
        SharedPreferences preferences = context.getSharedPreferences(ManagedRelayCredentialStore.PREFERENCES, Context.MODE_PRIVATE);
        store.write(ENDPOINT, "renewable-secret");
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        keyStore.deleteEntry("clipp_managed_relay_credentials_v1");
        assertNull(store.read(ENDPOINT));
        assertFalse(preferences.contains(ENDPOINT));
    }

    @Test
    public void ciphertextFileIsExcludedFromCloudBackupAndDeviceTransfer() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(hasCredentialExclusion(context.getResources().getXml(R.xml.backup_rules)));
        XmlPullParser extraction = context.getResources().getXml(R.xml.data_extraction_rules);
        int exclusions = 0;
        while (extraction.next() != XmlPullParser.END_DOCUMENT) {
            if (extraction.getEventType() == XmlPullParser.START_TAG
                && "exclude".equals(extraction.getName())
                && "sharedpref".equals(extraction.getAttributeValue(null, "domain"))
                && "clipp_managed_relay_credentials.xml".equals(extraction.getAttributeValue(null, "path"))) exclusions++;
        }
        assertEquals(2, exclusions);
    }

    private boolean hasCredentialExclusion(XmlPullParser parser) throws Exception {
        while (parser.next() != XmlPullParser.END_DOCUMENT) {
            if (parser.getEventType() == XmlPullParser.START_TAG
                && "exclude".equals(parser.getName())
                && "sharedpref".equals(parser.getAttributeValue(null, "domain"))
                && "clipp_managed_relay_credentials.xml".equals(parser.getAttributeValue(null, "path"))) return true;
        }
        return false;
    }
}
