package org.abuh.questassistant;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Locale;
import java.util.Set;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private JavaScriptReplyProxy replies;
    private PermissionRequest microphone;
    private SharedPreferences config;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        config = getSharedPreferences("assistant", MODE_PRIVATE);
        web = new WebView(this);
        setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!request.isForMainFrame()) return !"https".equals(request.getUrl().getScheme());
                if (url.startsWith(ORIGIN + "/assets/")) return false;
                if (request.hasGesture() && "https".equals(request.getUrl().getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) {}
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean audio = false;
                    for (String resource : request.getResources())
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) audio = true;
                    if (!audio || !ORIGIN.equals(request.getOrigin().toString().replaceAll("/$", ""))) {
                        request.deny(); return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    else {
                        if (microphone != null) microphone.deny();
                        microphone = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 7);
                    }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (microphone == request) microphone = null;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "QuestNative", Set.of(ORIGIN),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || !ORIGIN.equals(sourceOrigin.toString().replaceAll("/$", ""))) return;
                    replies = replyProxy;
                    try {
                        JSONObject data = new JSONObject(message.getData());
                        switch (data.optString("type")) {
                            case "config": sendConfig(); break;
                            case "save_config":
                                String backend = data.optString("backend");
                                String room = data.optString("room");
                                if (!validUrl(backend) || !validUrl(room)) {
                                    sendError("Use HTTPS addresses for the backend and situation room."); break;
                                }
                                String voiceId = data.optString("voiceId");
                                if (!voiceId.isEmpty() && !voiceId.matches("[A-Za-z0-9_-]{1,128}")) {
                                    sendError("Invalid ElevenLabs voice ID."); break;
                                }
                                config.edit().putString("voiceId", voiceId).putString("backend", backend).putString("room", room)
                                    .putString("token", data.optString("token")).apply();
                                break;
                            case "stop": if (tts != null) tts.stop(); break;
                            case "speak":
                                if (!ttsReady) { sendError("No device speech engine is available. Connect cloud voice."); break; }
                                String text = data.optString("text");
                                int result = tts.speak(text.substring(0, Math.min(text.length(), 4000)),
                                    TextToSpeech.QUEUE_FLUSH, null, "reply");
                                if (result == TextToSpeech.ERROR) sendError("Device voice could not start. Connect cloud voice.");
                                break;
                        }
                    } catch (Exception e) { sendError("Device message could not be processed."); }
                });
        }
        tts = new TextToSpeech(this, result -> {
            if (result == TextToSpeech.SUCCESS) {
                int language = tts.setLanguage(Locale.UK);
                ttsReady = language != TextToSpeech.LANG_MISSING_DATA && language != TextToSpeech.LANG_NOT_SUPPORTED;
                tts.setSpeechRate(0.95f);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {}
                    @Override public void onDone(String id) { runOnUiThread(() -> sendType("speech_done")); }
                    @Override public void onError(String id) { runOnUiThread(() -> sendError("Device voice failed.")); }
                });
            }
        });
        web.loadUrl(ORIGIN + "/assets/index.html");
    }
    private boolean validUrl(String value) {
        if (value.isEmpty()) return true;
        Uri uri = Uri.parse(value);
        return "https".equals(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null;
    }
    private void sendConfig() {
        try {
            JSONObject packet = new JSONObject().put("type", "config")
                .put("backend", config.getString("backend", ""))
                .put("room", config.getString("room", ""))
                .put("token", config.getString("token", ""))
                .put("voiceId", config.getString("voiceId", ""));
            if (replies != null) replies.postMessage(packet.toString());
        } catch (Exception ignored) {}
    }
    private void sendType(String type) {
        try { if (replies != null) replies.postMessage(new JSONObject().put("type", type).toString()); }
        catch (Exception ignored) {}
    }
    private void sendError(String error) {
        try { if (replies != null) replies.postMessage(new JSONObject().put("error", error).toString()); }
        catch (Exception ignored) {}
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == 7 && microphone != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
                microphone.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else { microphone.deny(); sendError("Microphone permission was declined. Typed commands still work."); }
            microphone = null;
        }
    }
    @Override protected void onPause() {
        web.evaluateJavascript("document.getElementById('stop')?.click()", null);
        if (tts != null) tts.stop();
        if (microphone != null) { microphone.deny(); microphone = null; }
        super.onPause();
    }
    @Override protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        web.destroy();
        super.onDestroy();
    }
}
