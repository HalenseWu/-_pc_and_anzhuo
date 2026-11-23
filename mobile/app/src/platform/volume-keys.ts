import { Capacitor, registerPlugin } from '@capacitor/core'

interface VolumeKeysNative {
  setEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean }>
  addListener(
    eventName: 'volumeKey',
    listener: (payload: { direction: 'up' | 'down' }) => void
  ): Promise<{ remove: () => Promise<void> | void }>
}

const VolumeKeys = registerPlugin<VolumeKeysNative>('VolumeKeys')

export const volumeKeysAvailable = Capacitor.isNativePlatform()

export async function setVolumeKeysEnabled(enabled: boolean): Promise<void> {
  if (!volumeKeysAvailable) return
  try {
    await VolumeKeys.setEnabled({ enabled })
  } catch {
    /* 插件未注册时静默降级 */
  }
}

export async function onVolumeKey(
  handler: (direction: 'up' | 'down') => void
): Promise<() => void> {
  if (!volumeKeysAvailable) return () => undefined
  try {
    const handle = await VolumeKeys.addListener('volumeKey', (payload) => handler(payload.direction))
    return () => {
      void handle.remove()
    }
  } catch {
    return () => undefined
  }
}
