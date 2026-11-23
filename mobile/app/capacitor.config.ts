import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.wuya.reader',
  appName: '无涯',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#F7F3EA'
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT'
    }
  }
}

export default config
