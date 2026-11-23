import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  localTtsNative,
  localTtsPrefetch,
  localTtsNowPlaying,
  localTtsOnMediaAction,
  localTtsOnUtterance,
  localTtsPrepare,
  localTtsSpeak,
  localTtsStop
} from './local-tts'

type UtteranceEvent = { id: string; type: 'start' | 'done' | 'error' }
type MediaAction = { action: 'play' | 'pause' | 'next' | 'prev' | 'stop' }

export type TtsEngine = 'system' | 'local'

interface TtsNative {
  init(): Promise<{ available: boolean; engine?: string }>
  speak(options: { id: string; text: string; rate: number }): Promise<void>
  stop(): Promise<void>
  setRate(options: { rate: number }): Promise<void>
  updateNowPlaying(options: {
    title: string
    playing: boolean
    hasPrev: boolean
    hasNext: boolean
  }): Promise<void>
  addListener(
    eventName: 'utterance',
    listener: (payload: UtteranceEvent) => void
  ): Promise<{ remove: () => Promise<void> | void }>
  addListener(
    eventName: 'mediaAction',
    listener: (payload: MediaAction) => void
  ): Promise<{ remove: () => Promise<void> | void }>
}

const Native = registerPlugin<TtsNative>('Tts')
const native = Capacitor.isNativePlatform()

let engine: TtsEngine = 'system'
let localReady = false
let localSid = 0

export function setTtsEngine(next: TtsEngine): void {
  engine = next
}

export function getTtsEngine(): TtsEngine {
  return engine
}

export function setLocalSpeaker(sid: number): void {
  localSid = sid
}

/* ------- 浏览器里的模拟引擎：按字数推进，方便调试队列/高亮 ------- */
let fakeTimer: number | null = null
let fakeListener: ((event: UtteranceEvent) => void) | null = null

function fakeStop(): void {
  if (fakeTimer) window.clearTimeout(fakeTimer)
  fakeTimer = null
}

function fakeSpeak(id: string, text: string, rate: number): void {
  fakeStop()
  fakeListener?.({ id, type: 'start' })
  const ms = Math.max(220, Math.round((text.length * 90) / Math.max(0.5, rate)))
  fakeTimer = window.setTimeout(() => {
    fakeTimer = null
    fakeListener?.({ id, type: 'done' })
  }, ms)
}

/** 尝试加载本地神经音色；失败时回退系统 TTS */
export async function prepareLocalEngine(): Promise<{ ok: boolean; error?: string; warmupMs?: number }> {
  if (!localTtsNative) return { ok: false, error: '仅安卓支持本地音色' }
  const result = await localTtsPrepare('')
  localReady = result.ok
  return { ok: result.ok, error: result.error, warmupMs: result.warmupMs }
}

export async function ttsInit(): Promise<{ available: boolean; engine: string }> {
  if (engine === 'local') {
    if (!localReady) {
      const prepared = await prepareLocalEngine()
      if (!prepared.ok) {
        engine = 'system'
      }
    }
    if (localReady) return { available: true, engine: '本地音色' }
  }
  if (!native) return { available: true, engine: '浏览器模拟' }
  try {
    const result = await Native.init()
    return { available: Boolean(result.available), engine: result.engine ?? '系统语音' }
  } catch {
    return { available: false, engine: '不可用' }
  }
}

export async function ttsSpeak(id: string, text: string, rate: number): Promise<void> {
  if (engine === 'local' && localReady && localTtsNative) {
    await localTtsSpeak(id, text, rate, localSid)
    return
  }
  if (!native) {
    fakeSpeak(id, text, rate)
    return
  }
  try {
    await Native.speak({ id, text, rate })
  } catch {
    /* 失败时就当读完，推进队列 */
  }
}

/** 仅本地引擎支持预合成：提前把后面的句子算好，播放时几乎没有停顿 */
export async function ttsPrefetch(id: string, text: string, rate: number): Promise<void> {
  if (engine !== 'local' || !localReady || !localTtsNative) return
  await localTtsPrefetch(id, text, rate, localSid)
}

export async function ttsStop(): Promise<void> {
  if (engine === 'local' && localTtsNative) await localTtsStop()
  if (!native) {
    fakeStop()
    return
  }
  try {
    await Native.stop()
  } catch {
    /* 忽略 */
  }
}

export async function ttsSetRate(rate: number): Promise<void> {
  if (!native) return
  try {
    await Native.setRate({ rate })
  } catch {
    /* 忽略 */
  }
}

export async function ttsUpdateNowPlaying(payload: {
  title: string
  playing: boolean
  hasPrev: boolean
  hasNext: boolean
}): Promise<void> {
  if (engine === 'local' && localTtsNative) await localTtsNowPlaying(payload)
  if (!native) return
  try {
    await Native.updateNowPlaying(payload)
  } catch {
    /* 忽略 */
  }
}

export async function onUtterance(handler: (event: UtteranceEvent) => void): Promise<() => void> {
  if (!native) {
    fakeListener = handler
    return () => {
      fakeListener = null
    }
  }
  const offLocal = await localTtsOnUtterance(handler)
  let offSystem: (() => void) | null = null
  try {
    const handle = await Native.addListener('utterance', handler)
    offSystem = () => {
      void handle.remove()
    }
  } catch {
    offSystem = null
  }
  return () => {
    offLocal()
    offSystem?.()
  }
}

export async function onMediaAction(handler: (event: MediaAction) => void): Promise<() => void> {
  if (!native) return () => undefined
  const offLocal = await localTtsOnMediaAction(handler)
  let offSystem: (() => void) | null = null
  try {
    const handle = await Native.addListener('mediaAction', handler)
    offSystem = () => {
      void handle.remove()
    }
  } catch {
    offSystem = null
  }
  return () => {
    offLocal()
    offSystem?.()
  }
}
