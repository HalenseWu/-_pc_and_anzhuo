import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const APP_VERSION = '0.3.7'

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [react()],
  build: {
    /* 老一点儿的系统 WebView 也要能跑 */
    target: 'es2020',
    chunkSizeWarningLimit: 2000
  }
})
