// SOURCE-ONLY external platform ports. The production plugin, PluginCall and
// JSObject are compiled unchanged. No Android runtime, JSON parser or native UI.
const json = `package org.json;
import java.util.*;
public class JSONObject {
 public static final Object NULL=new Object(); private final Map<String,Object> values=new HashMap<>();
 public JSONObject(){} public JSONObject(String text)throws JSONException{throw new UnsupportedOperationException("JSON parser not modelled");}
 public JSONObject(JSONObject other,String[] names)throws JSONException{for(String name:names)values.put(name,other.opt(name));}
 public Object opt(String key){return values.get(key);} public boolean has(String key){return values.containsKey(key);} public boolean isNull(String key){return opt(key)==null||opt(key)==NULL;} public Iterator<String> keys(){return values.keySet().iterator();}
 public JSONObject put(String key,Object value)throws JSONException{values.put(key,value);return this;}
 public JSONObject put(String key,int value)throws JSONException{return put(key,Integer.valueOf(value));} public JSONObject put(String key,long value)throws JSONException{return put(key,Long.valueOf(value));}
 public JSONObject put(String key,double value)throws JSONException{return put(key,Double.valueOf(value));} public JSONObject put(String key,boolean value)throws JSONException{return put(key,Boolean.valueOf(value));}
 public Object get(String key)throws JSONException{if(!values.containsKey(key))throw new JSONException();return values.get(key);}
 public String getString(String key)throws JSONException{throw new UnsupportedOperationException();} public int getInt(String key)throws JSONException{throw new UnsupportedOperationException();} public boolean getBoolean(String key)throws JSONException{throw new UnsupportedOperationException();} public long getLong(String key)throws JSONException{throw new UnsupportedOperationException();} public double getDouble(String key)throws JSONException{throw new UnsupportedOperationException();} public JSONObject getJSONObject(String key)throws JSONException{throw new UnsupportedOperationException();}
}`;
export const sources = {
  "org/json/JSONObject.java": json,
  "org/json/JSONException.java": `package org.json; public class JSONException extends Exception { public JSONException(){} }`,
  "org/json/JSONArray.java": `package org.json; public class JSONArray {public int length(){return 0;} public Object get(int index)throws JSONException{throw new UnsupportedOperationException();}}`,
  "android/view/View.java": `package android.view; public class View {}`,
  "androidx/annotation/Nullable.java": `package androidx.annotation; public @interface Nullable {}`,
  "androidx/activity/OnBackPressedCallback.java": `package androidx.activity; public abstract class OnBackPressedCallback {private boolean enabled;public boolean removed;public OnBackPressedCallback(boolean value){enabled=value;}public void setEnabled(boolean value){enabled=value;}public boolean isEnabled(){return enabled&&!removed;}public void remove(){removed=true;}public abstract void handleOnBackPressed();}`,
  "androidx/activity/OnBackPressedDispatcher.java": `package androidx.activity; import java.util.*;public class OnBackPressedDispatcher {private final List<OnBackPressedCallback> callbacks=new ArrayList<>();public int rootDelegations;public void addCallback(Object owner,OnBackPressedCallback callback){callbacks.add(callback);}public void onBackPressed(){for(int i=callbacks.size()-1;i>=0;i--){OnBackPressedCallback c=callbacks.get(i);if(c.isEnabled()){c.handleOnBackPressed();return;}}rootDelegations++;}}`,
  "androidx/core/view/WindowInsetsCompat.java": `package androidx.core.view;public class WindowInsetsCompat {public boolean visible;public boolean isVisible(int type){return visible;}public static class Type {public static int ime(){return 8;}}}`,
  "androidx/core/view/ViewCompat.java": `package androidx.core.view;import android.view.View;public class ViewCompat {public static WindowInsetsCompat insets=new WindowInsetsCompat();public static WindowInsetsCompat getRootWindowInsets(View view){return insets;}}`,
  "androidx/core/view/WindowInsetsControllerCompat.java": `package androidx.core.view;import android.view.View;public class WindowInsetsControllerCompat {public WindowInsetsControllerCompat(Object window,View view){}public void hide(int type){ViewCompat.insets.visible=false;}}`,
  "com/getcapacitor/SourceActivity.java": `package com.getcapacitor;import java.util.*;import androidx.activity.OnBackPressedDispatcher;public class SourceActivity {public boolean focused=true,defer;private final Queue<Runnable> queue=new ArrayDeque<>();private final OnBackPressedDispatcher dispatcher=new OnBackPressedDispatcher();public void runOnUiThread(Runnable action){if(defer)queue.add(action);else action.run();}public void flush(){while(!queue.isEmpty())queue.remove().run();}public boolean hasWindowFocus(){return focused;}public Object getWindow(){return null;}public OnBackPressedDispatcher getOnBackPressedDispatcher(){return dispatcher;}}`,
  "com/getcapacitor/Bridge.java": `package com.getcapacitor;import android.view.View;public class Bridge {private final View view=new View();public View getWebView(){return view;}public void releaseCall(PluginCall call){throw new UnsupportedOperationException();}}`,
  "com/getcapacitor/Plugin.java": `package com.getcapacitor;import java.util.*;public class Plugin {private final SourceActivity activity=new SourceActivity();private final Bridge bridge=new Bridge();public final List<JSObject> events=new ArrayList<>();public SourceActivity getActivity(){return activity;}public Bridge getBridge(){return bridge;}public void load(){}protected void handleOnDestroy(){}public void destroyFromPlatform(){handleOnDestroy();}protected void notifyListeners(String name,JSObject event){if(!name.equals("back"))throw new AssertionError(name);events.add(event);}}`,
  "com/getcapacitor/PluginMethod.java": `package com.getcapacitor;public @interface PluginMethod {}`,
  "com/getcapacitor/annotation/CapacitorPlugin.java": `package com.getcapacitor.annotation;public @interface CapacitorPlugin {String name();}`,
  "com/getcapacitor/MessageHandler.java": `package com.getcapacitor;public class MessageHandler {public void sendResponseMessage(PluginCall call,PluginResult result,PluginResult error){}}`,
  "com/getcapacitor/PluginResult.java": `package com.getcapacitor;public class PluginResult {public PluginResult(){}public PluginResult(JSObject data){}public void put(String key,Object value){}}`,
  "com/getcapacitor/Logger.java": `package com.getcapacitor;public class Logger {public static String tags(String tag){return tag;}public static void error(String tag,String text,Exception error){}}`,
  "com/getcapacitor/JSArray.java": `package com.getcapacitor;public class JSArray extends org.json.JSONArray {public JSArray(Object[] items){}}`,
};
