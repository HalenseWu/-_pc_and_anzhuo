package com.wuya.reader;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import android.media.MediaPlayer;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsMatchaModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/** 本地神经音色：sherpa-onnx + MeloTTS，支持预合成，避免句间停顿 */
@CapacitorPlugin(name = "LocalTts")
public class LocalTtsPlugin extends Plugin {

    private static final String TAG = "WuyaLocalTts";
    private static LocalTtsPlugin instance;
    private static final int CACHE_LIMIT = 12;

    private OfflineTts tts;
    private MediaPlayer player;
    private Thread loopThread;
    private volatile boolean importing = false;
    private static final int REQUEST_PICK_ZIP = 4021;

    private final ArrayDeque<Task> urgent = new ArrayDeque<>();
    private final ArrayDeque<Task> prefetch = new ArrayDeque<>();
    private final Object lock = new Object();
    private final Map<String, File> cache = new LinkedHashMap<String, File>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, File> eldest) {
            if (size() > CACHE_LIMIT) {
                File file = eldest.getValue();
                if (file != null) file.delete();
                return true;
            }
            return false;
        }
    };
    private final Map<String, Task> pending = new HashMap<>();
    private int token = 0;
    private String playingId = "";

    private static class Task {
        final String id;
        final String text;
        final float rate;
        final int sid;
        final int token;
        final boolean play;
        final File prepareModel;
        final PluginCall prepareCall;

        Task(String id, String text, float rate, int sid, int token, boolean play, File prepareModel, PluginCall prepareCall) {
            this.id = id;
            this.text = text;
            this.rate = rate;
            this.sid = sid;
            this.token = token;
            this.play = play;
            this.prepareModel = prepareModel;
            this.prepareCall = prepareCall;
        }

        static Task forPrepare(File model, PluginCall call) {
            return new Task("", "", 1f, 0, 0, false, model, call);
        }

        boolean isPrepare() {
            return prepareCall != null;
        }
    }

    @Override
    public void load() {
        instance = this;
        loopThread = new Thread(this::loop, "wuya-local-tts");
        loopThread.setDaemon(true);
        loopThread.start();
    }

    private File defaultModelDir() {
        return new File(getContext().getFilesDir(), "tts/melo");
    }

    private String ruleFsts(File modelDir) {
        String[] names = {"date.fst", "number.fst", "phone.fst", "new_heteronym.fst"};
        StringBuilder builder = new StringBuilder();
        for (String name : names) {
            File file = new File(modelDir, name);
            if (!file.exists()) continue;
            if (builder.length() > 0) builder.append(',');
            builder.append(file.getAbsolutePath());
        }
        return builder.toString();
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        String dir = call.getString("dir", "");
        final File modelDir = (dir == null || dir.isEmpty()) ? defaultModelDir() : new File(dir);
        if (tts != null) {
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("sampleRate", tts.getSampleRate());
            result.put("speakers", tts.getNumSpeakers());
            call.resolve(result);
            return;
        }
        synchronized (lock) {
            urgent.addLast(Task.forPrepare(new File(modelDir, "model.int8.onnx"), call));
            lock.notifyAll();
        }
    }

    private void doPrepare(File model, PluginCall call) {
        File modelDir = model.getParentFile();
        try {
            if (modelDir == null) {
                JSObject fail = new JSObject();
                fail.put("ok", false);
                fail.put("error", "音色包路径无效");
                call.resolve(fail);
                return;
            }
                if (!model.exists()) model = new File(modelDir, "model.onnx");
                if (!model.exists()) {
                    File[] onnx = modelDir.listFiles((dir, name) -> name.endsWith(".onnx"));
                    if (onnx != null && onnx.length > 0) model = onnx[0];
                }
                File tokens = new File(modelDir, "tokens.txt");
                if (modelDir == null || !model.exists() || !tokens.exists()) {
                    JSObject fail = new JSObject();
                    fail.put("ok", false);
                    fail.put("error", "音色包缺少 model.onnx 或 tokens.txt");
                    call.resolve(fail);
                    return;
                }
                File lexicon = new File(modelDir, "lexicon.txt");
                File dict = new File(modelDir, "dict");
                OfflineTtsVitsModelConfig vits = OfflineTtsVitsModelConfig.builder()
                        .setModel(model.getAbsolutePath())
                        .setTokens(tokens.getAbsolutePath())
                        .setLexicon(lexicon.exists() ? lexicon.getAbsolutePath() : "")
                        .setDictDir(dict.exists() ? dict.getAbsolutePath() : "")
                        .build();
                File acoustic = new File(modelDir, "model-steps-3.onnx");
                File vocoder = new File(modelDir, "vocoder.onnx");
                OfflineTtsModelConfig.Builder modelBuilder = OfflineTtsModelConfig.builder()
                        .setNumThreads(preferredThreads())
                        .setDebug(false)
                        .setProvider("cpu");
                if (acoustic.exists() && vocoder.exists()) {
                    /* Matcha：声学模型 + 声码器，速度比 VITS 快很多 */
                    modelBuilder.setMatcha(OfflineTtsMatchaModelConfig.builder()
                            .setAcousticModel(acoustic.getAbsolutePath())
                            .setVocoder(vocoder.getAbsolutePath())
                            .setTokens(tokens.getAbsolutePath())
                            .setLexicon(lexicon.exists() ? lexicon.getAbsolutePath() : "")
                            .setDictDir(dict.exists() ? dict.getAbsolutePath() : "")
                            .build());
                } else {
                    modelBuilder.setVits(vits);
                }
                OfflineTtsModelConfig modelConfig = modelBuilder.build();
                OfflineTtsConfig config = OfflineTtsConfig.builder()
                        .setModel(modelConfig)
                        .setRuleFsts(ruleFsts(modelDir))
                        .build();
                OfflineTts created = new OfflineTts(config);
                tts = created;
                /* 预热一次，顺便测出单句合成耗时，方便判断快慢 */
                long started = System.currentTimeMillis();
                try {
                    created.generate("你好", 0, 1.0f);
                } catch (Throwable ignored) {
                }
                long warmupMs = System.currentTimeMillis() - started;
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("sampleRate", created.getSampleRate());
                result.put("speakers", created.getNumSpeakers());
                result.put("warmupMs", warmupMs);
                call.resolve(result);
            } catch (Throwable error) {
                Log.e(TAG, "prepare failed", error);
                JSObject fail = new JSObject();
                fail.put("ok", false);
                fail.put("error", String.valueOf(error.getMessage()));
                call.resolve(fail);
            }
    }

    /** 打开系统文件选择器，原生解压音色包（避免 JS 端把 75MB 读进内存导致闪退） */
    @PluginMethod
    public void pickAndImport(PluginCall call) {
        if (importing) {
            call.reject("busy");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/octet-stream"});
        startActivityForResult(call, intent, "onZipPicked");
    }

    @ActivityCallback
    private void onZipPicked(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        Intent data = activityResult.getData();
        if (activityResult.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject cancel = new JSObject();
            cancel.put("ok", false);
            cancel.put("error", "已取消");
            call.resolve(cancel);
            return;
        }
        final Uri uri = data.getData();
        importing = true;
        new Thread(() -> {
            try {
                int files = extractZip(uri, defaultModelDir());
                importing = false;
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("files", files);
                call.resolve(result);
            } catch (Throwable error) {
                importing = false;
                Log.e(TAG, "import failed", error);
                JSObject fail = new JSObject();
                fail.put("ok", false);
                fail.put("error", String.valueOf(error.getMessage()));
                call.resolve(fail);
            }
        }, "wuya-tts-import").start();
    }

    /** 解压 zip 到目标目录；返回写出的文件数 */
    private int extractZip(Uri uri, File targetDir) throws Exception {
        deleteRecursive(targetDir);
        if (!targetDir.exists() && !targetDir.mkdirs()) {
            throw new IllegalStateException("无法创建目录");
        }
        int count = 0;
        long totalBytes = 0;
        boolean hasModel = false;
        InputStream raw = getContext().getContentResolver().openInputStream(uri);
        if (raw == null) throw new IllegalStateException("无法读取压缩包");
        ZipInputStream zip = new ZipInputStream(new java.io.BufferedInputStream(raw));
        try {
            ZipEntry entry;
            byte[] buffer = new byte[64 * 1024];
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName().replace('\\', '/');
                if (name.startsWith("/") || name.contains("..")) continue;
                if (entry.isDirectory()) continue;
                File out = new File(targetDir, name);
                File parent = out.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) continue;
                FileOutputStream fos = new FileOutputStream(out);
                try {
                    int read;
                    while ((read = zip.read(buffer)) > 0) {
                        fos.write(buffer, 0, read);
                    }
                } finally {
                    fos.close();
                }
                count += 1;
                totalBytes += out.length();
                if ((count & 3) == 0) {
                    JSObject progress = new JSObject();
                    progress.put("files", count);
                    progress.put("megabytes", totalBytes / (1024 * 1024));
                    notifyListeners("importProgress", progress);
                }
                if (name.toLowerCase().endsWith(".onnx")) hasModel = true;
                zip.closeEntry();
            }
        } finally {
            zip.close();
        }
        if (!hasModel) throw new IllegalStateException("压缩包里没有 .onnx 模型");
        /* 导入新音色包后，旧的引擎实例作废 */
        tts = null;
        return count;
    }

    private void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursive(child);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    /** 合成线程数：按核心数取一半，最多 4 个 */
    private int preferredThreads() {
        int cores = Runtime.getRuntime().availableProcessors();
        return Math.max(2, Math.min(4, cores / 2));
    }

    private File wavFile(String id) {
        return new File(getContext().getCacheDir(), "tts-" + id + ".wav");
    }

    private void enqueue(Task task, boolean front) {
        synchronized (lock) {
            if (cache.containsKey(task.id)) {
                if (task.play) playCached(task.id);
                return;
            }
            Task existing = pending.get(task.id);
            if (existing != null) {
                if (task.play && !existing.play) {
                    /* 已经排队但只是预合成，升级成需要播放 */
                    prefetch.remove(existing);
                    urgent.addLast(new Task(task.id, task.text, task.rate, task.sid, task.token, true, null, null));
                }
                return;
            }
            pending.put(task.id, task);
            if (front) urgent.addLast(task);
            else prefetch.addLast(task);
            lock.notifyAll();
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (tts == null) {
            call.reject("local-tts-not-ready");
            return;
        }
        String id = call.getString("id", String.valueOf(System.currentTimeMillis()));
        String text = call.getString("text", "");
        double rate = call.getDouble("rate") != null ? call.getDouble("rate") : 1.0;
        Integer sidValue = call.getInt("sid");
        int sid = sidValue != null ? sidValue : 0;
        playingId = id;
        token += 1;
        final int myToken = token;
        enqueue(new Task(id, text, (float) rate, sid, myToken, true, null, null), true);
        call.resolve();
    }

    @PluginMethod
    public void prefetch(PluginCall call) {
        if (tts == null) {
            call.resolve();
            return;
        }
        String id = call.getString("id", "");
        String text = call.getString("text", "");
        if (id.isEmpty() || text.isEmpty()) {
            call.resolve();
            return;
        }
        double rate = call.getDouble("rate") != null ? call.getDouble("rate") : 1.0;
        Integer sidValue = call.getInt("sid");
        int sid = sidValue != null ? sidValue : 0;
        enqueue(new Task(id, text, (float) rate, sid, token, false, null, null), false);
        call.resolve();
    }

    private void loop() {
        while (true) {
            Task task;
            synchronized (lock) {
                while (urgent.isEmpty() && prefetch.isEmpty()) {
                    try {
                        lock.wait();
                    } catch (InterruptedException ignore) {
                        return;
                    }
                }
                task = !urgent.isEmpty() ? urgent.pollFirst() : prefetch.pollFirst();
            }
            if (task == null) continue;
            if (task.isPrepare()) {
                doPrepare(task.prepareModel, task.prepareCall);
                continue;
            }
            try {
                GeneratedAudio audio = tts.generate(task.text, task.sid, task.rate);
                File file = wavFile(task.id);
                boolean ok = audio.save(file.getAbsolutePath());
                synchronized (lock) {
                    pending.remove(task.id);
                    if (ok) cache.put(task.id, file);
                }
                if (ok && task.play) playCached(task.id);
                else if (!ok && task.play) emit(task.id, "error");
            } catch (Throwable error) {
                Log.e(TAG, "generate failed", error);
                synchronized (lock) {
                    pending.remove(task.id);
                }
                if (task.play) emit(task.id, "error");
            }
        }
    }

    private void playCached(String id) {
        File file;
        synchronized (lock) {
            file = cache.get(id);
        }
        if (file == null) return;
        final String playId = id;
        getActivity().runOnUiThread(() -> {
            if (!playId.equals(playingId)) return;
            try {
                if (player == null) player = new MediaPlayer();
                player.reset();
                player.setDataSource(file.getAbsolutePath());
                player.setOnCompletionListener(mp -> emit(playId, "done"));
                player.setOnErrorListener((mp, what, extra) -> {
                    emit(playId, "error");
                    return true;
                });
                player.prepare();
                player.start();
                emit(playId, "start");
            } catch (Throwable error) {
                Log.e(TAG, "play failed", error);
                emit(playId, "error");
            }
        });
    }

    private void emit(String id, String type) {
        JSObject payload = new JSObject();
        payload.put("id", id);
        payload.put("type", type);
        notifyListeners("utterance", payload);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        token += 1;
        playingId = "";
        synchronized (lock) {
            urgent.clear();
            prefetch.clear();
            pending.clear();
        }
        if (player != null) {
            try {
                if (player.isPlaying()) player.stop();
            } catch (Throwable ignored) {
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void updateNowPlaying(PluginCall call) {
        String title = call.getString("title", "无涯");
        Boolean playing = call.getBoolean("playing", Boolean.FALSE);
        Boolean hasPrev = call.getBoolean("hasPrev", Boolean.FALSE);
        Boolean hasNext = call.getBoolean("hasNext", Boolean.TRUE);
        boolean isPlaying = Boolean.TRUE.equals(playing);
        Context context = getContext();
        if (isPlaying) {
            TtsService.start(context, title, true, Boolean.TRUE.equals(hasPrev), Boolean.TRUE.equals(hasNext));
        } else {
            TtsService.update(context, title, false, Boolean.TRUE.equals(hasPrev), Boolean.TRUE.equals(hasNext));
        }
        call.resolve();
    }

    public static void dispatchMedia(String action) {
        LocalTtsPlugin plugin = instance;
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("action", action);
        plugin.notifyListeners("mediaAction", payload);
    }

    @Override
    protected void handleOnDestroy() {
        token += 1;
        if (player != null) {
            try {
                player.release();
            } catch (Throwable ignored) {
            }
            player = null;
        }
        if (loopThread != null) {
            loopThread.interrupt();
            loopThread = null;
        }
        super.handleOnDestroy();
    }
}
