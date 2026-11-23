package com.wuya.reader;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "Tts")
public class TtsPlugin extends Plugin {

    private static final String TAG = "WuyaTts";
    private static TtsPlugin instance;

    private TextToSpeech tts;
    private boolean ready = false;
    private boolean languageReady = false;
    private String engineName = "";
    private PluginCall pendingInit;
    private float rate = 1f;
    private String nowTitle = "无涯";
    private boolean nowPlaying = false;

    @Override
    public void load() {
        instance = this;
        tts = new TextToSpeech(getContext(), status -> {
            ready = status == TextToSpeech.SUCCESS;
            if (ready) {
                int result = tts.setLanguage(Locale.CHINA);
                languageReady = result != TextToSpeech.LANG_MISSING_DATA
                        && result != TextToSpeech.LANG_NOT_SUPPORTED;
                if (tts.getDefaultEngine() != null) engineName = tts.getDefaultEngine();
                tts.setSpeechRate(rate);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        emitUtterance(utteranceId, "start");
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        emitUtterance(utteranceId, "done");
                    }

                    @Override
                    public void onError(String utteranceId) {
                        emitUtterance(utteranceId, "error");
                    }
                });
            }
            if (pendingInit != null) {
                resolveInit(pendingInit);
                pendingInit = null;
            }
        });
    }

    private void emitUtterance(String id, String type) {
        JSObject payload = new JSObject();
        payload.put("id", id);
        payload.put("type", type);
        notifyListeners("utterance", payload);
    }

    private void resolveInit(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", ready && languageReady);
        result.put("engine", engineName);
        call.resolve(result);
    }

    @PluginMethod
    public void init(PluginCall call) {
        if (ready) {
            resolveInit(call);
            return;
        }
        pendingInit = call;
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!ready) {
            call.reject("tts-not-ready");
            return;
        }
        String text = call.getString("text", "");
        String id = call.getString("id", String.valueOf(System.currentTimeMillis()));
        if (text == null || text.isEmpty()) {
            call.resolve();
            return;
        }
        rate = (float) (call.getDouble("rate") != null ? call.getDouble("rate") : 1.0);
        tts.setSpeechRate(Math.max(0.3f, Math.min(2.5f, rate)));
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, id);
        call.resolve();
    }

    @PluginMethod
    public void setRate(PluginCall call) {
        Double value = call.getDouble("rate");
        rate = value == null ? 1f : (float) value.doubleValue();
        if (ready) tts.setSpeechRate(Math.max(0.3f, Math.min(2.5f, rate)));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (ready) tts.stop();
        stopServiceNotification();
        call.resolve();
    }

    @PluginMethod
    public void updateNowPlaying(PluginCall call) {
        nowTitle = call.getString("title", "无涯");
        Boolean playing = call.getBoolean("playing", Boolean.FALSE);
        nowPlaying = Boolean.TRUE.equals(playing);
        Boolean hasPrev = call.getBoolean("hasPrev", Boolean.FALSE);
        Boolean hasNext = call.getBoolean("hasNext", Boolean.FALSE);
        ensureNotificationPermission();
        if (nowPlaying) {
            TtsService.start(getContext(), nowTitle, true, Boolean.TRUE.equals(hasPrev), Boolean.TRUE.equals(hasNext));
        } else {
            TtsService.update(getContext(), nowTitle, false, Boolean.TRUE.equals(hasPrev), Boolean.TRUE.equals(hasNext));
        }
        call.resolve();
    }

    private void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        if (getActivity() != null) {
            getActivity().requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7711);
        }
    }

    private void stopServiceNotification() {
        try {
            getContext().stopService(new Intent(getContext(), TtsService.class));
        } catch (Throwable ignored) {
        }
    }

    /** 由前台服务回传的媒体按钮 */
    public static void dispatchMedia(String action) {
        TtsPlugin plugin = instance;
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("action", action);
        plugin.notifyListeners("mediaAction", payload);
        if ("stop".equals(action)) {
            plugin.stopServiceNotification();
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        stopServiceNotification();
        super.handleOnDestroy();
    }
}
