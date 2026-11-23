package com.wuya.reader;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VolumeKeys")
public class VolumeKeysPlugin extends Plugin {

    private static VolumeKeysPlugin instance;
    private static volatile boolean enabled = false;

    @Override
    public void load() {
        instance = this;
    }

    public static boolean isEnabled() {
        return enabled && instance != null;
    }

    public static void emit(String direction) {
        VolumeKeysPlugin plugin = instance;
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("direction", direction);
        plugin.notifyListeners("volumeKey", payload);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        Boolean value = call.getBoolean("enabled", Boolean.FALSE);
        enabled = Boolean.TRUE.equals(value);
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }
}
