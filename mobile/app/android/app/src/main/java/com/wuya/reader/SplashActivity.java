package com.wuya.reader;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

public class SplashActivity extends Activity {

    private static final String TAG = "WuyaSplash";
    private static final long HOLD_MS = 1500L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable enter = new Runnable() {
        @Override
        public void run() {
            go();
        }
    };

    private void go() {
        try {
            startActivity(new Intent(SplashActivity.this, MainActivity.class));
        } catch (Throwable error) {
            Log.e(TAG, "start MainActivity failed", error);
        }
        finish();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            setContentView(R.layout.activity_splash);
        } catch (Throwable error) {
            /* 启动页画不出来也不能挡住进书架 */
            Log.e(TAG, "inflate splash failed", error);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.removeCallbacks(enter);
        handler.postDelayed(enter, HOLD_MS);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(enter);
        super.onPause();
    }
}
