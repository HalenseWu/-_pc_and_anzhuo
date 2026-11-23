import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChapterNode } from '../core/types'
import type { ChapterContent } from '../store/library'
import { segmentParagraph, splitSentences } from '../core/sentences'
import type { TtsEngine } from '../platform/tts'
import { setTtsEngine } from '../platform/tts'
import {
  onMediaAction,
  onUtterance,
  ttsInit,
  ttsSetRate,
  ttsPrefetch,
  ttsSpeak,
  ttsStop,
  ttsUpdateNowPlaying
} from '../platform/tts'

export interface ReadPosition {
  chapterId: string
  block: number
  seg: number
}

interface Options {
  chapter: ChapterContent | null
  chapters: ChapterNode[]
  rate: number
  follow: 'page' | 'scroll' | 'none'
  engine: TtsEngine
  onFollow: (block: number, seg: number) => void
  /** 需要下一章内容时调用，返回是否成功 */
  onNeedChapter: (index: number) => Promise<ChapterContent | null>
  onChapterChange: (index: number) => void
}

interface Item {
  chapterId: string
  block: number
  seg: number
  text: string
}

interface Queue {
  chapterIndex: number
  items: Item[]
}

function itemId(seq: number, index: number): string {
  return `u${seq}-${index}`
}

export function useReadAloud(options: Options) {
  const { chapter, chapters, rate, follow, engine } = options
  const [active, setActive] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState<ReadPosition | null>(null)
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [sleepLeft, setSleepLeft] = useState(0)
  const [engineName, setEngineName] = useState('系统语音')

  const queueRef = useRef<Queue | null>(null)
  const queueSeqRef = useRef(0)
  const indexRef = useRef(0)
  const rateRef = useRef(rate)
  const playingRef = useRef(false)
  const stateRef = useRef({ follow, chapter })
  const optionsRef = useRef(options)

  stateRef.current = { follow, chapter }
  optionsRef.current = options
  rateRef.current = rate

  /* ---- 队列构建 ---- */
  const buildQueue = useCallback((content: ChapterContent, chapterIndex: number, fromBlock: number, fromSeg: number): Queue => {
    const items: Item[] = []
    content.paragraphs.forEach((paragraph, block) => {
      const segments = segmentParagraph(paragraph)
      const sentences = splitSentences(paragraph)
      let sentenceCursor = 0
      segments.forEach((segment, seg) => {
        if (block < fromBlock || (block === fromBlock && seg < fromSeg)) {
          sentenceCursor += segment.sentences.length
          return
        }
        segment.sentences.forEach((sentenceIndex) => {
          const text = sentences[sentenceIndex]
          if (text) items.push({ chapterId: content.id, block, seg, text })
        })
        sentenceCursor += segment.sentences.length
      })
      void sentenceCursor
    })
    queueSeqRef.current += 1
    return { chapterIndex, items }
  }, [])

  const updateNowPlaying = useCallback((title: string, isPlaying: boolean) => {
    void ttsUpdateNowPlaying({
      title,
      playing: isPlaying,
      hasPrev: indexRef.current > 0,
      hasNext: Boolean(queueRef.current && indexRef.current < queueRef.current.items.length - 1)
    })
  }, [])

  /* ---- 播放 ---- */
  const speakAt = useCallback(async (index: number) => {
    const queue = queueRef.current
    if (!queue) return
    if (index >= queue.items.length) {
      /* 本章读完 → 下一章 */
      const nextIndex = queue.chapterIndex + 1
      if (nextIndex >= chapters.length) {
        setPlaying(false)
        playingRef.current = false
        void ttsStop()
        return
      }
      const content = await optionsRef.current.onNeedChapter(nextIndex)
      if (!content) {
        setPlaying(false)
        playingRef.current = false
        return
      }
      optionsRef.current.onChapterChange(nextIndex)
      queueRef.current = buildQueue(content, nextIndex, 0, 0)
      indexRef.current = 0
      updateNowPlaying(content.title, true)
      await speakAt(0)
      return
    }
    indexRef.current = index
    const item = queue.items[index]
    setPosition({ chapterId: item.chapterId, block: item.block, seg: item.seg })
    if (optionsRef.current.follow !== 'none') optionsRef.current.onFollow(item.block, item.seg)
    void ttsSpeak(itemId(queueSeqRef.current, index), item.text, rateRef.current)
  }, [buildQueue, chapters.length, updateNowPlaying])

  /* ---- 语音回调 ---- */
  useEffect(() => {
    let dispose: (() => void) | null = null
    let cancelled = false
    void onUtterance((event) => {
      if (!playingRef.current) return
      if (event.type === 'start') {
        const queue = queueRef.current
        if (queue) {
          for (let ahead = 1; ahead <= 3; ahead += 1) {
            const next = queue.items[indexRef.current + ahead]
            if (next) void ttsPrefetch(itemId(queueSeqRef.current, indexRef.current + ahead), next.text, rateRef.current)
          }
        }
        return
      }
      if (event.type === 'done') {
        const queue = queueRef.current
        if (!queue) return
        void speakAt(indexRef.current + 1)
      } else if (event.type === 'error') {
        void speakAt(indexRef.current + 1)
      }
    }).then((off) => {
      if (cancelled) off()
      else dispose = off
    })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [speakAt])

  /* ---- 通知栏 / 锁屏控制 ---- */
  useEffect(() => {
    let dispose: (() => void) | null = null
    let cancelled = false
    void onMediaAction((event) => {
      if (event.action === 'pause') void pause()
      if (event.action === 'play') void resume()
      if (event.action === 'next') void next()
      if (event.action === 'prev') void prev()
      if (event.action === 'stop') void stop()
    }).then((off) => {
      if (cancelled) off()
      else dispose = off
    })
    return () => {
      cancelled = true
      dispose?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(
    async (fromBlock: number, fromSeg: number) => {
      if (!chapter) return
      setTtsEngine(engine)
      /* 引擎初始化最多等 4 秒，超时就先用系统语音，避免点了没反应 */
      const info = await Promise.race([
        ttsInit(),
        new Promise<{ available: boolean; engine: string }>((resolve) =>
          window.setTimeout(() => resolve({ available: true, engine: '系统语音（本地未就绪）' }), 4000)
        )
      ])
      setEngineName(info.engine)
      if (!info.available) {
        setPlaying(false)
        return
      }
      const index = chapters.findIndex((item) => item.id === chapter.id)
      queueRef.current = buildQueue(chapter, index < 0 ? 0 : index, fromBlock, fromSeg)
      indexRef.current = 0
      setActive(true)
      setPlaying(true)
      playingRef.current = true
      updateNowPlaying(chapter.title, true)
      await speakAt(0)
    },
    [buildQueue, chapter, chapters, speakAt, updateNowPlaying]
  )

  const pause = useCallback(async () => {
    playingRef.current = false
    setPlaying(false)
    await ttsStop()
    updateNowPlaying(stateRef.current.chapter?.title ?? '', false)
  }, [updateNowPlaying])

  const resume = useCallback(async () => {
    if (!queueRef.current) return
    setPlaying(true)
    playingRef.current = true
    updateNowPlaying(stateRef.current.chapter?.title ?? '', true)
    await speakAt(indexRef.current)
  }, [speakAt, updateNowPlaying])

  const stop = useCallback(async () => {
    playingRef.current = false
    setPlaying(false)
    setActive(false)
    setPosition(null)
    setSleepMinutes(0)
    queueRef.current = null
    await ttsStop()
  }, [])

  const next = useCallback(async () => {
    await speakAt(indexRef.current + 1)
  }, [speakAt])

  const prev = useCallback(async () => {
    await speakAt(Math.max(0, indexRef.current - 1))
  }, [speakAt])

  /* 调速：立即生效并重读当前句 */
  useEffect(() => {
    void ttsSetRate(rate)
    if (playingRef.current) {
      const queue = queueRef.current
      if (queue) void ttsSpeak(itemId(queueSeqRef.current, indexRef.current), queue.items[indexRef.current]?.text ?? '', rate)
    }
  }, [rate])

  /* 定时停止 */
  useEffect(() => {
    if (!sleepMinutes) {
      setSleepLeft(0)
      return
    }
    const deadline = Date.now() + sleepMinutes * 60_000
    setSleepLeft(sleepMinutes * 60)
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setSleepLeft(left)
      if (left <= 0) {
        window.clearInterval(timer)
        void stop()
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [sleepMinutes, stop])

  useEffect(() => {
    return () => {
      void ttsStop()
    }
  }, [])

  return {
    active,
    playing,
    position,
    engine: engineName,
    sleepMinutes,
    sleepLeft,
    start,
    pause,
    resume,
    stop,
    next,
    prev,
    setSleepMinutes,
    setPosition
  }
}
