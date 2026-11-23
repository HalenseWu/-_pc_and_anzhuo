package com.wuya.reader;

import android.view.KeyEvent;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(VolumeKeysPlugin.class);
        registerPlugin(TtsPlugin.class);
        registerPlugin(LocalTtsPlugin.class);
        super.onCreate(savedInstanceState);
        try {
            /* 升级后避免 WebView 继续用缓存里的旧前端 */
            getBridge().getWebView().getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            getBridge().getWebView().clearCache(true);
        } catch (Throwable ignored) {
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (VolumeKeysPlugin.isEnabled()
                && event.getAction() == KeyEvent.ACTION_DOWN
                && (event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_UP
                || event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            VolumeKeysPlugin.emit(event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down");
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
