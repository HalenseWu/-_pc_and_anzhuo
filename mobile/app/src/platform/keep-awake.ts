import { Capacitor } from '@capacitor/core'
import { KeepAwake } from '@capacitor-community/keep-awake'

let active = false
let lock: WakeLockSentinel | null = null

async function acquireNative(): Promise<void> {
  try {
    const supported = await KeepAwake.isSupported()
    if (!supported) return
    await KeepAwake.keepAwake()
  } catch {
    /* 插件不可用时忽略 */
  }
}

async function acquireWeb(): Promise<void> {
  try {
    if (!('wakeLock' in navigator)) return
    lock = await navigator.wakeLock.request('screen')
    lock.addEventListener('release', () => {
      lock = null
      active = false
    })
  } catch {
    /* 被系统拒绝时忽略 */
  }
}

export async function acquireKeepAwake(): Promise<void> {
  if (active) return
  active = true
  if (Capacitor.isNativePlatform()) await acquireNative()
  else await acquireWeb()
}

export async function releaseKeepAwake(): Promise<void> {
  active = false
  if (Capacitor.isNativePlatform()) {
    try {
      await KeepAwake.allowSleep()
    } catch {
      /* 忽略 */
    }
    return
  }
  try {
    await lock?.release()
  } catch {
    /* 忽略 */
  }
  lock = null
}

export function isKeepAwakeActive(): boolean {
  return active
}
