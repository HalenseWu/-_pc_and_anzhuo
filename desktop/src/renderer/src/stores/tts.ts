import { create } from 'zustand'
import type { ReadChapter, TtsConfig, TtsStatus } from '../../../shared/types'
import { useReader } from './reader'

export interface TtsUnit {
  text: string
  block: number
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2]

let session = 0
let queue: TtsUnit[] = []
let cursor = 0
let audioEl: HTMLAudioElement | null = null
let onEnded: (() => Promise<TtsUnit[] | null>) | null = null
const cache = new Map<number, Promise<Uint8Array>>()

interface TtsState {
  config: TtsConfig | null
  status: TtsStatus | null
  playing: boolean
  paused: boolean
  speaking: TtsUnit | null
  progress: number
  follow: boolean
  error: string | null
  speed: number
  load: () => Promise<void>
  patch: (value: Partial<TtsConfig>) => Promise<void>
  refreshStatus: () => Promise<void>
  startService: () => Promise<void>
  stopService: () => Promise<void>
  testVoice: () => Promise<void>
  setSpeed: (value: number) => void
  setFollow: (value: boolean) => void
  speak: (units: TtsUnit[], next?: () => Promise<TtsUnit[] | null>) => void
  readFrom: (startBlock: number) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

async function synth(text: string, speed: number): Promise<Uint8Array> {
  if (!window.wuya) throw new Error('接口不可用')
  return window.wuya.tts.synthesize(text, speed)
}

function playBuffer(
  data: Uint8Array,
  speed: number,
  onProgress?: (value: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([data as unknown as BlobPart], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    const el = new Audio(url)
    audioEl = el
    el.playbackRate = speed
    const done = (): void => {
      URL.revokeObjectURL(url)
      if (audioEl === el) audioEl = null
      resolve()
    }
    el.ontimeupdate = () => {
      if (el.duration && onProgress) onProgress(Math.min(1, el.currentTime / el.duration))
    }
    el.onended = done
    el.onerror = () => {
      URL.revokeObjectURL(url)
      if (audioEl === el) audioEl = null
      reject(new Error('音频播放失败'))
    }
    void el.play().catch((error) => {
      URL.revokeObjectURL(url)
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

export const useTts = create<TtsState>((set, get) => {
  const getBuffer = (index: number): Promise<Uint8Array> => {
    if (index >= queue.length) return Promise.reject(new Error('朗读结束'))
    const hit = cache.get(index)
    if (hit) return hit
    const speed = get().speed
    const task = synth(queue[index].text, speed)
    cache.set(index, task)
    return task
  }

  const run = async (id: number): Promise<void> => {
    while (id === session) {
      if (cursor >= queue.length) {
        if (onEnded) {
          const more = await onEnded().catch(() => null)
          if (id !== session) return
          if (more && more.length > 0) {
            queue = more
            cursor = 0
            cache.clear()
            continue
          }
        }
        set({ playing: false, speaking: null, paused: false })
        return
      }
      const unit = queue[cursor]
      set({ speaking: unit, progress: 0 })
      try {
        const data = await getBuffer(cursor)
        if (id !== session) return
        void getBuffer(cursor + 1).catch(() => undefined)
        await playBuffer(data, get().speed, (value) => set({ progress: value }))
      } catch (error) {
        if (id !== session) return
        set({
          playing: false,
          speaking: null,
          error: error instanceof Error ? error.message : String(error)
        })
        return
      }
      if (id !== session) return
      cursor += 1
    }
  }

  return {
    config: null,
    status: null,
    playing: false,
    paused: false,
    speaking: null,
    progress: 0,
    follow: true,
    error: null,
    speed: 1,

    load: async () => {
      const config = await window.wuya?.tts.config.get()
      if (config) set({ config })
      const status = await window.wuya?.tts.status()
      if (status) set({ status })
    },

    patch: async (value) => {
      const config = await window.wuya?.tts.config.set(value)
      if (config) set({ config })
      const status = await window.wuya?.tts.status()
      if (status) set({ status })
    },

    refreshStatus: async () => {
      const status = await window.wuya?.tts.status()
      if (status) set({ status })
    },

    startService: async () => {
      set({ status: { running: true, ready: false, message: '正在启动朗读服务…' } })
      const status = await window.wuya?.tts.start()
      if (status) set({ status })
      if (!status?.ready && get().config?.engine === 'gpt-sovits') {
        set({ error: status?.message ?? '朗读服务未就绪' })
      }
    },

    stopService: async () => {
      const status = await window.wuya?.tts.stop()
      if (status) set({ status })
    },

    testVoice: async () => {
      set({ error: null })
      try {
        if (!window.wuya) return
        const status = await window.wuya.tts.status()
        if (get().config?.engine === 'gpt-sovits' && !status?.ready) {
          await get().startService()
          if (!get().status?.ready) return
        }
        const data = await window.wuya.tts.synthesize('无涯朗读测试，风吹过江面。', 1)
        await playBuffer(data, 1)
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) })
      }
    },

    setFollow: (value) => set({ follow: value }),

  setSpeed: (value) => {
      set({ speed: value })
      if (audioEl) audioEl.playbackRate = value
    },

    readFrom: (startBlock) => {
      const build = (chapter: ReadChapter): TtsUnit[] =>
        chapter.paragraphs
          .map((text, index) => ({
            text: text.replace(/^\[\[img:[^\]]+\]\]$/, '').trim(),
            block: index
          }))
          .filter((unit) => unit.text.length > 0)

      const state = useReader.getState()
      if (!state.chapter) return
      const units = build(state.chapter).filter((unit) => unit.block >= startBlock)
      if (units.length === 0) {
        set({ error: '从这一段往后没有可朗读的文字' })
        return
      }
      get().speak(units, async () => {
        const current = useReader.getState()
        const index = current.chapters.findIndex((item) => item.id === current.chapter?.id)
        const next = current.chapters[index + 1]
        if (!next) return null
        await current.loadChapter(next.id)
        const loaded = useReader.getState().chapter
        if (!loaded || loaded.id !== next.id) return null
        return build(loaded)
      })
    },

    speak: (units, next) => {
      onEnded = next ?? null
      session += 1
      if (audioEl) {
        audioEl.pause()
        audioEl = null
      }
      cache.clear()
      queue = units.filter((unit) => unit.text.trim().length > 0)
      cursor = 0
      if (queue.length === 0) {
        set({ error: '这一章没有可朗读的文字' })
        return
      }
      set({ playing: true, paused: false, speaking: null, progress: 0, error: null })
      void run(session)
    },

    pause: () => {
      audioEl?.pause()
      set({ paused: true })
    },

    resume: () => {
      void audioEl?.play()
      set({ paused: false })
    },

    stop: () => {
      session += 1
      if (audioEl) {
        audioEl.pause()
        audioEl = null
      }
      queue = []
      cursor = 0
      cache.clear()
      onEnded = null
      set({ playing: false, paused: false, speaking: null, progress: 0 })
    }
  }
})
