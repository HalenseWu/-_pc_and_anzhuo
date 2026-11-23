import { Capacitor, registerPlugin } from '@capacitor/core'

interface LocalTtsNative {
  prepare(options: { dir: string }): Promise<{
    ok: boolean
    sampleRate?: number
    speakers?: number
    warmupMs?: number
    error?: string
  }>
  speak(options: { id: string; text: string; rate: number; sid: number }): Promise<void>
  prefetch(options: { id: string; text: string; rate: number; sid: number }): Promise<void>
  pickAndImport(): Promise<{ ok: boolean; error?: string; files?: number }>
  addListener(
    eventName: 'importProgress',
    listener: (payload: { files: number; megabytes: number }) => void
  ): Promise<{ remove: () => Promise<void> | void }>
  stop(): Promise<void>
  addListener(
    eventName: 'utterance',
    listener: (payload: { id: string; type: 'start' | 'done' | 'error' }) => void
  ): Promise<{ remove: () => Promise<void> | void }>
  addListener(
    eventName: 'mediaAction',
    listener: (payload: { action: 'play' | 'pause' | 'next' | 'prev' | 'stop' }) => void
  ): Promise<{ remove: () => Promise<void> | void }>
  updateNowPlaying(options: {
    title: string
    playing: boolean
    hasPrev: boolean
    hasNext: boolean
  }): Promise<void>
}

const Native = registerPlugin<LocalTtsNative>('LocalTts')

export const localTtsNative = Capacitor.isNativePlatform()

export async function localTtsPrepare(
  dir: string
): Promise<{ ok: boolean; error?: string; speakers?: number; warmupMs?: number }> {
  if (!localTtsNative) return { ok: false, error: '仅安卓可用' }
  try {
    const result = await Native.prepare({ dir })
    return { ok: Boolean(result.ok), error: result.error, speakers: result.speakers, warmupMs: result.warmupMs }
  } catch (issue) {
    return { ok: false, error: issue instanceof Error ? issue.message : String(issue) }
  }
}

export async function localTtsSpeak(
  id: string,
  text: string,
  rate: number,
  sid: number
): Promise<void> {
  if (!localTtsNative) return
  try {
    await Native.speak({ id, text, rate, sid })
  } catch {
    /* 忽略 */
  }
}

export async function localTtsPrefetch(
  id: string,
  text: string,
  rate: number,
  sid: number
): Promise<void> {
  if (!localTtsNative) return
  try {
    await Native.prefetch({ id, text, rate, sid })
  } catch {
    /* 忽略 */
  }
}

/** 调系统文件选择器 + 原生解压，避免大音色包把 JS 内存撑爆 */
export async function localTtsPickImport(): Promise<{ ok: boolean; error?: string; files?: number }> {
  if (!localTtsNative) return { ok: false, error: '仅安卓支持' }
  try {
    const result = await Native.pickAndImport()
    return { ok: Boolean(result.ok), error: result.error, files: result.files }
  } catch (issue) {
    return { ok: false, error: issue instanceof Error ? issue.message : String(issue) }
  }
}

export async function localTtsOnImportProgress(
  handler: (payload: { files: number; megabytes: number }) => void
): Promise<() => void> {
  if (!localTtsNative) return () => undefined
  try {
    const handle = await Native.addListener('importProgress', handler)
    return () => {
      void handle.remove()
    }
  } catch {
    return () => undefined
  }
}

export async function localTtsStop(): Promise<void> {
  if (!localTtsNative) return
  try {
    await Native.stop()
  } catch {
    /* 忽略 */
  }
}

export async function localTtsOnUtterance(
  handler: (payload: { id: string; type: 'start' | 'done' | 'error' }) => void
): Promise<() => void> {
  if (!localTtsNative) return () => undefined
  try {
    const handle = await Native.addListener('utterance', handler)
    return () => {
      void handle.remove()
    }
  } catch {
    return () => undefined
  }
}

export async function localTtsOnMediaAction(
  handler: (payload: { action: 'play' | 'pause' | 'next' | 'prev' | 'stop' }) => void
): Promise<() => void> {
  if (!localTtsNative) return () => undefined
  try {
    const handle = await Native.addListener('mediaAction', handler)
    return () => {
      void handle.remove()
    }
  } catch {
    return () => undefined
  }
}

export async function localTtsNowPlaying(payload: {
  title: string
  playing: boolean
  hasPrev: boolean
  hasNext: boolean
}): Promise<void> {
  if (!localTtsNative) return
  try {
    await Native.updateNowPlaying(payload)
  } catch {
    /* 忽略 */
  }
}
