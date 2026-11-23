import type { WuyaApi } from '../preload'

declare global {
  interface Window {
    wuya?: WuyaApi
  }
}

export {}
