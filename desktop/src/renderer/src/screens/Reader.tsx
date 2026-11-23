import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReadAnchor, ReadChapter } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { WindowButtons } from '../components/WindowButtons'
import { TocDrawer, type Tab } from '../components/reader/TocDrawer'
import { SettingsPanel } from '../components/reader/SettingsPanel'
import { TtsPanel } from '../components/reader/TtsPanel'
import { TtsBall } from '../components/reader/TtsBall'
import { useTts } from '../stores/tts'
import { useLibrary } from '../stores/library'
import { useMarks } from '../stores/marks'
import { useReadingClock } from '../hooks/useReadingClock'
import { DEFAULT_SETTINGS, useReader, type PageAnim, type ReadingMode, type ReaderSettings } from '../stores/reader'

const GAP = 64

interface ScrollPos {
  chapterId: string
  anchor: ReadAnchor
}

export function Reader(): React.JSX.Element {
  const open = useReader((state) => state.open)
  const book = useReader((state) => state.book)
  const chapter = useReader((state) => state.chapter)
  const chapters = useReader((state) => state.chapters)
  const chapterIndex = useReader((state) => state.chapterIndex)
  const page = useReader((state) => state.page)
  const pages = useReader((state) => state.pages)
  const settings = useReader((state) => state.settings)
  const setPage = useReader((state) => state.setPage)
  const setPages = useReader((state) => state.setPages)
  const mode = settings.mode
  const pendingAnchor = useReader((state) => state.pendingAnchor)
  const highlight = useReader((state) => state.highlight)

  const viewportRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const initialParams = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const [tocOpen, setTocOpen] = useState(
    () => location.hash === '#reader-toc' || initialParams.has('q') || initialParams.has('tab')
  )
  const [drawerTab, setDrawerTab] = useState<Tab>(() => {
    const tab = initialParams.get('tab')
    return tab === 'bookmarks' || tab === 'notes' ? tab : 'toc'
  })
  const [settingsOpen, setSettingsOpen] = useState(() => location.hash === '#reader-settings')
  const [ttsOpen, setTtsOpen] = useState(false)
  const ttsSpeaking = useTts((state) => state.speaking)
  const ttsProgress = useTts((state) => state.progress)
  const ttsFollow = useTts((state) => state.follow)
  const ttsPlaying = useTts((state) => state.playing)

  /* ---------- 自动阅读 ---------- */
  const [autoOpen, setAutoOpen] = useState(false)
  const [autoOn, setAutoOn] = useState(false)
  const [autoPageSec, setAutoPageSec] = useState(12)
  const [autoScrollPx, setAutoScrollPx] = useState(46)
  const [speedInfo, setSpeedInfo] = useState<{ page: number | null; scroll: number | null }>({
    page: null,
    scroll: null
  })
  const turnsRef = useRef<number[]>([])
  const scrollSamples = useRef<{ t: number; top: number }[]>([])
  const updateSettings = useReader((state) => state.updateSettings)

  const [stream, setStream] = useState<ReadChapter[]>([])
  const streamRef = useRef<ReadChapter[]>([])
  const loadingRef = useRef(false)
  const posRef = useRef<ScrollPos | null>(null)
  const modeRef = useRef(mode)
  const [scrollPercent, setScrollPercent] = useState(0)

  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = (): void => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 双页对开：页宽自动收窄以适配窗口，低于 420px/页 时回退单页
  const maxPageW = Math.floor((windowWidth - 192 - GAP) / 2)
  const spreadActive = settings.spread && maxPageW >= 420
  const pageW = spreadActive ? Math.min(settings.pageWidth, maxPageW) : settings.pageWidth
  const colStep = pageW + GAP
  const spreadWidth = pageW * 2 + GAP
  const colsPerView = spreadActive ? 2 : 1
  const step = colStep * colsPerView
  const viewWidth = spreadActive ? spreadWidth : pageW
  /* 纸张比正文更宽：两侧留白随窗口伸缩，正文宽度保持 settings.pageWidth */
  const paperPad = Math.max(28, Math.min(176, Math.floor((windowWidth - viewWidth) / 4)))
  const pageWRef = useRef(pageW)
  pageWRef.current = pageW
  const [anim, setAnim] = useState<{ type: 'cover' | 'fade'; from: number; to: number } | null>(null)

  /* 阅读统计：累计本轮翻页读过的字数，由心跳每 15 秒取走 */
  const charsRef = useRef(0)
  useReadingClock(book, () => {
    const value = charsRef.current
    charsRef.current = 0
    return value
  })
  useEffect(() => {
    const state = useReader.getState()
    if (!state.chapter) return
    const node = state.chapters[state.chapterIndex]
    const total = node?.chars ?? state.chapter.paragraphs.join('').length
    charsRef.current += Math.max(1, Math.round(total / Math.max(1, state.pages)))
  }, [page, chapter?.id])
  const animTimer = useRef(0)

  const turn = useCallback((delta: number): void => {
    const store = useReader.getState()
    const target = store.page + delta
    if (target < 0) {
      void store.prevChapter()
      return
    }
    if (target > store.pages - 1) {
      void store.nextChapter()
      return
    }
    turnsRef.current = [...turnsRef.current.slice(-11), Date.now()]
    const kind = store.settings.animation
    if (kind === 'cover' || kind === 'fade') {
      window.clearTimeout(animTimer.current)
      setAnim({ type: kind, from: store.page, to: target })
      animTimer.current = window.setTimeout(() => setAnim(null), 340)
    }
    store.setPage(target)
  }, [])

  useEffect(() => {
    setAnim(null)
    useReader.setState({ highlight: null })
  }, [chapter?.id])

  useEffect(() => {
    if (book) void useMarks.getState().load(book.id)
  }, [book?.id])

  /* 滚动模式下按锚点定位：搜索、书签、笔记跳转都走这里 */
  useEffect(() => {
    if (mode !== 'scroll') return
    const store = useReader.getState()
    const anchor = store.pendingAnchor
    if (!anchor || !store.chapter) return
    const scroller = scrollRef.current
    if (!scroller) return
    const section = scroller.querySelector<HTMLElement>(`[data-cid="${store.chapter.id}"]`)
    if (!section) return
    // 章首锚点：滚到这一章的最顶上，让章标题露出来
    if (anchor.block === 0 && anchor.offset === 0) {
      const sectionTop =
        section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      scroller.scrollTop = Math.max(0, sectionTop - 8)
      store.consumeAnchor()
      return
    }
    const paragraph = section?.querySelector<HTMLElement>(`[data-block="${anchor.block}"]`)
    if (!paragraph) return
    const top =
      paragraph.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    scroller.scrollTop = Math.max(0, top - 70)
    store.consumeAnchor()
  }, [mode, chapter, stream, pendingAnchor])

  useEffect(() => () => window.clearTimeout(animTimer.current), [])

  /* ---------------- 分页模式 ---------------- */
  const measure = useCallback(() => {
    const flow = flowRef.current
    const viewport = viewportRef.current
    if (!flow || !viewport) return

    const store = useReader.getState()
    const currentW = pageWRef.current
    const colStepW = currentW + GAP
    const columns = Math.max(1, Math.round((flow.scrollWidth + GAP) / colStepW))
    const total = Math.max(1, Math.ceil(columns / colsPerView))
    if (total !== store.pages) setPages(total)

    if (store.pendingEnd) {
      setPage(total - 1)
      store.consumeAnchor()
      return
    }

    const anchor = store.pendingAnchor
    if (anchor) {
      const holder = flow.querySelector<HTMLElement>(`[data-block="${anchor.block}"]`)
      const textNode = holder?.firstChild
      if (holder && textNode && textNode.nodeType === Node.TEXT_NODE) {
        const max = textNode.textContent?.length ?? 0
        const range = document.createRange()
        range.setStart(textNode, Math.min(anchor.offset, max))
        range.setEnd(textNode, Math.min(anchor.offset, max))
        const rect = range.getBoundingClientRect()
        const flowRect = flow.getBoundingClientRect()
        const column = Math.floor((rect.left - flowRect.left) / colStepW)
        setPage(Math.max(0, Math.min(total - 1, Math.floor(column / colsPerView))))
      }
      store.consumeAnchor()
    }
  }, [setPage, setPages, colsPerView])

  /* 出声后收起面板，换成悬浮球 */
  useEffect(() => {
    if (ttsPlaying) setTtsOpen(false)
  }, [ttsPlaying])

  /* 高亮正在朗读的段落 */
  useEffect(() => {
    const root = mode === 'page' ? flowRef.current : scrollRef.current
    if (!root) return
    const apply = (): void => {
      root.querySelectorAll('.rd-hl').forEach((element) => element.classList.remove('rd-hl'))
      const block = useTts.getState().speaking?.block
      if (block === undefined) return
      const chapterId = useReader.getState().chapter?.id ?? ''
      const target =
        mode === 'page'
          ? root.querySelector<HTMLElement>(`[data-block="${block}"]`)
          : root.querySelector<HTMLElement>(`[data-cid="${chapterId}"] [data-block="${block}"]`)
      target?.classList.add('rd-hl')
    }
    apply()
    const timer = window.setTimeout(apply, 120)
    return () => window.clearTimeout(timer)
  }, [ttsSpeaking, mode, page, chapter?.id, colsPerView])

  /* 朗读跟随：把“正在读的那一行”带到视野里 */
  useEffect(() => {
    if (!ttsSpeaking || !ttsFollow) return
    const range = (): Range | null => {
      const store = useReader.getState()
      const block = ttsSpeaking.block
      const holder =
        mode === 'page'
          ? flowRef.current?.querySelector<HTMLElement>(`[data-block="${block}"]`)
          : scrollRef.current?.querySelector<HTMLElement>(
              `[data-cid="${store.chapter?.id ?? ''}"] [data-block="${block}"]`
            )
      const node = holder?.firstChild
      if (!holder || !node || node.nodeType !== Node.TEXT_NODE) return null
      const length = node.textContent?.length ?? 0
      if (length === 0) return null
      const offset = Math.min(length - 1, Math.floor(length * ttsProgress))
      const instance = document.createRange()
      instance.setStart(node, offset)
      instance.setEnd(node, Math.min(length, offset + 1))
      return instance
    }

    const instance = range()
    if (!instance) {
      return
    }

    if (mode === 'page') {
      const flow = flowRef.current
      if (!flow) return
      const rect = instance.getBoundingClientRect()
      const flowRect = flow.getBoundingClientRect()
      const stepPx = pageWRef.current + GAP
      const column = Math.floor((rect.left - flowRect.left) / stepPx)
      const target = Math.max(0, Math.min(pages - 1, Math.floor(column / colsPerView)))
      if (target !== page) {
        setPage(target)
      }
      return
    }

    const scroller = scrollRef.current
    if (!scroller) return
    const holder = instance.startContainer.parentElement
    if (!holder) {
      return
    }
    const lineHeight = parseFloat(window.getComputedStyle(holder).lineHeight) || 30
    const rect = instance.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const targetY = scrollerRect.top + lineHeight * 8
    if (rect.top > targetY + 2) {
      scroller.scrollTop += rect.top - targetY
    }
  }, [ttsSpeaking, ttsProgress, ttsFollow, mode, page, pages, colsPerView])

  useLayoutEffect(() => {
    if (mode !== 'page') return
    let cancelled = false
    const run = (): void => {
      if (!cancelled) measure()
    }
    const raf = requestAnimationFrame(() => {
      void document.fonts.ready.then(run)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [
    measure,
    mode,
    pendingAnchor,
    chapter,
    settings.font,
    settings.fontSize,
    settings.lineHeight,
    settings.paragraphGap,
    settings.pageWidth,
    pageW
  ])

  useEffect(() => {
    if (mode !== 'page') return
    const viewport = viewportRef.current
    if (!viewport) return
    let timer = 0
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, 80)
    })
    observer.observe(viewport)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [measure, mode])

  useEffect(() => {
    if (mode !== 'page') return
    if (page > pages - 1) setPage(pages - 1)
  }, [page, pages, setPage, mode])

  /* ---------------- 滚动模式 ---------------- */
  const appendNext = useCallback(async (): Promise<void> => {
    const store = useReader.getState()
    const list = streamRef.current
    const last = list[list.length - 1]
    if (!last || !store.book || loadingRef.current) return
    const index = store.chapters.findIndex((item) => item.id === last.id)
    const next = store.chapters[index + 1]
    if (!next) return
    loadingRef.current = true
    try {
      const data = await window.wuya?.reader.chapter(store.book.id, next.id)
      if (data && !streamRef.current.some((item) => item.id === data.id)) {
        const merged = [...streamRef.current, data]
        streamRef.current = merged
        setStream(merged)
      }
    } finally {
      loadingRef.current = false
    }
  }, [])

  const prependPrev = useCallback(async (): Promise<void> => {
    const store = useReader.getState()
    const list = streamRef.current
    const first = list[0]
    if (!first || !store.book || loadingRef.current) return
    const index = store.chapters.findIndex((item) => item.id === first.id)
    const prev = store.chapters[index - 1]
    if (!prev) return
    loadingRef.current = true
    try {
      const data = await window.wuya?.reader.chapter(store.book.id, prev.id)
      if (data && !streamRef.current.some((item) => item.id === data.id)) {
        const scroller = scrollRef.current
        const before = scroller?.scrollHeight ?? 0
        const merged = [data, ...streamRef.current]
        streamRef.current = merged
        setStream(merged)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const node = scrollRef.current
            if (node) node.scrollTop += node.scrollHeight - before
          })
        })
      }
    } finally {
      loadingRef.current = false
    }
  }, [])

  const readScrollAnchor = useCallback((): ScrollPos | null => {
    const scroller = scrollRef.current
    if (!scroller) return null
    const top = scroller.getBoundingClientRect().top + 6
    const sections = scroller.querySelectorAll<HTMLElement>('[data-cid]')
    for (const section of sections) {
      if (section.getBoundingClientRect().bottom <= top) continue
      const paragraphs = section.querySelectorAll<HTMLElement>('[data-block]')
      for (const paragraph of paragraphs) {
        if (paragraph.getBoundingClientRect().bottom > top) {
          return {
            chapterId: section.dataset.cid ?? '',
            anchor: { block: Number(paragraph.dataset.block ?? 0), offset: 0 }
          }
        }
      }
      return { chapterId: section.dataset.cid ?? '', anchor: { block: 0, offset: 0 } }
    }
    return null
  }, [])

  const syncVisible = useCallback((): void => {
    const scroller = scrollRef.current
    if (!scroller) return
    const sections = scroller.querySelectorAll<HTMLElement>('[data-cid]')
    if (!sections.length) return
    const line = scroller.scrollTop + 90
    let visible = sections[0]
    for (const section of sections) {
      if (section.offsetTop <= line) visible = section
    }
    const id = visible.dataset.cid
    const store = useReader.getState()
    if (!id || store.chapter?.id === id) return
    const data = streamRef.current.find((item) => item.id === id)
    if (!data) return
    useReader.setState({ chapter: data, chapterIndex: data.index })
  }, [])

  const scrollTick = useRef(0)
  const onScroll = useCallback((): void => {
    if (scrollTick.current) return
    scrollTick.current = requestAnimationFrame(() => {
      scrollTick.current = 0
      const scroller = scrollRef.current
      if (!scroller) return
      const max = scroller.scrollHeight - scroller.clientHeight
      setScrollPercent(max > 0 ? Math.max(0, Math.min(1, scroller.scrollTop / max)) : 0)
      if (scroller.scrollTop < 260) void prependPrev()
      if (max - scroller.scrollTop < 1000) void appendNext()
      syncVisible()
      const pos = readScrollAnchor()
      if (pos) posRef.current = pos
      scrollSamples.current = [
        ...scrollSamples.current.slice(-39),
        { t: performance.now(), top: scroller.scrollTop }
      ]
    })
  }, [appendNext, prependPrev, syncVisible, readScrollAnchor])

  /* 进入滚动模式 / 切章：初始化章节流 */
  useEffect(() => {
    if (mode !== 'scroll' || !chapter || !book) return
    if (streamRef.current.some((item) => item.id === chapter.id)) return
    streamRef.current = [chapter]
    setStream([chapter])
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    void appendNext()
  }, [mode, chapter, book, appendNext])

  /* 滚动模式渲染完成后刷新一次位置，切模式与保存进度才有锚点 */
  useEffect(() => {
    if (mode !== 'scroll') return
    const pos = readScrollAnchor()
    if (pos) posRef.current = pos
  }, [mode, stream, readScrollAnchor])

  /* 模式切换：尽量保持阅读位置 */
  useEffect(() => {
    if (modeRef.current === mode) return
    const from = modeRef.current
    modeRef.current = mode
    const pos = posRef.current
    if (!pos) return
    if (mode === 'scroll') {
      // 交给滚动锚点 effect 处理，等文本渲染完再定位
      useReader.setState({ pendingAnchor: pos.anchor })
    } else if (from === 'scroll') {
      useReader.setState({ pendingAnchor: pos.anchor })
      const store = useReader.getState()
      if (store.chapter?.id !== pos.chapterId) {
        const target = store.chapters.find((item) => item.id === pos.chapterId)
        if (target) void store.loadChapter(target.id, pos.anchor)
      }
    }
  }, [mode])

  /* ---------------- 位置与进度 ---------------- */
  const readPageAnchor = useCallback((): ReadAnchor | null => {
    const viewport = viewportRef.current
    if (!viewport) return null
    const rect = viewport.getBoundingClientRect()
    const range = document.caretRangeFromPoint(rect.left + 4, rect.top + 14)
    if (!range) return null
    const node = range.startContainer
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
    const holder = element?.closest<HTMLElement>('[data-block]')
    if (!holder) return null
    return { block: Number(holder.dataset.block ?? 0), offset: range.startOffset }
  }, [])

  const percent =
    chapters.length > 0
      ? mode === 'page'
        ? ((chapterIndex + (page + 1) / Math.max(1, pages)) / chapters.length) * 100
        : ((chapterIndex + scrollPercent) / chapters.length) * 100
      : 0

  /* 分页模式下持续记录位置，切到滚动时才能接上 */
  useEffect(() => {
    if (mode !== 'page' || !chapter) return
    const anchor = readPageAnchor()
    if (anchor) posRef.current = { chapterId: chapter.id, anchor }
  }, [mode, chapter, page, pages, readPageAnchor])

  useEffect(() => {
    if (!open || !book || !chapter) return
    const timer = window.setTimeout(() => {
      const store = useReader.getState()
      const total = store.chapters.length || 1
      if (mode === 'scroll') {
        const pos = posRef.current
        const scroller = scrollRef.current
        const section = pos ? scroller?.querySelector<HTMLElement>(`[data-cid="${pos.chapterId}"]`) : null
        let fraction = 0
        if (scroller && section) {
          const seen = scroller.scrollTop - section.offsetTop
          fraction = Math.max(0, Math.min(1, seen / Math.max(1, section.offsetHeight)))
        }
        const value = ((store.chapterIndex + fraction) / total) * 100
        if (pos) store.setCurrentAnchor({ chapterId: pos.chapterId, anchor: pos.anchor })
        void window.wuya?.reader.saveProgress(book.id, {
          chapterId: pos?.chapterId ?? chapter.id,
          percent: value,
          anchor: pos?.anchor ?? null
        })
        return
      }
      const value = ((store.chapterIndex + (store.page + 1) / Math.max(1, store.pages)) / total) * 100
      const anchor = readPageAnchor() ?? { block: 0, offset: 0 }
      if (anchor) {
        posRef.current = { chapterId: chapter.id, anchor }
        store.setCurrentAnchor({ chapterId: chapter.id, anchor })
      }
      void window.wuya?.reader.saveProgress(book.id, {
        chapterId: chapter.id,
        percent: value,
        anchor
      })
    }, 480)
    return () => window.clearTimeout(timer)
  }, [open, book, chapter, page, pages, mode, scrollPercent, readPageAnchor])

  /* ---------------- 交互 ---------------- */
  const next = useCallback((): void => turn(1), [turn])

  const prev = useCallback((): void => turn(-1), [turn])

  const goChapter = useCallback((delta: number): void => {
    const store = useReader.getState()
    const index = store.chapters.findIndex((item) => item.id === store.chapter?.id)
    if (index < 0) return
    const target = store.chapters[index + delta]
    if (!target) return
    void store.loadChapter(target.id)
  }, [])

  const scrollBy = useCallback((delta: number): void => {
    const scroller = scrollRef.current
    if (scroller) scroller.scrollBy({ top: delta })
  }, [])

  /* 按最近的手动翻页 / 滚动估算推荐速度（比实测慢 10%） */
  const computeSpeed = useCallback((): void => {
    const times = turnsRef.current
    let page: number | null = null
    if (times.length >= 3) {
      let sum = 0
      for (let i = 1; i < times.length; i += 1) sum += times[i] - times[i - 1]
      const avg = sum / (times.length - 1) / 1000
      if (avg > 1 && avg < 90) page = Math.round(avg * 1.1 * 10) / 10
    }

    const now = performance.now()
    const recent = scrollSamples.current.filter((sample) => now - sample.t < 20000)
    let scroll: number | null = null
    if (recent.length >= 4) {
      let distance = 0
      let seconds = 0
      for (let i = 1; i < recent.length; i += 1) {
        const delta = recent[i].top - recent[i - 1].top
        const dt = (recent[i].t - recent[i - 1].t) / 1000
        if (delta > 0 && dt > 0.05) {
          distance += delta
          seconds += dt
        }
      }
      if (seconds > 1) scroll = Math.round((distance / seconds) * 0.9)
    }

    setSpeedInfo({ page, scroll })
    if (page) setAutoPageSec(page)
    if (scroll) setAutoScrollPx(scroll)
  }, [])

  /* 自动翻页 / 自动滚动 */
  useEffect(() => {
    if (!autoOn) return
    if (mode === 'page') {
      const timer = window.setInterval(() => next(), Math.max(2, autoPageSec) * 1000)
      return () => window.clearInterval(timer)
    }
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = Math.min(0.08, (now - last) / 1000)
      last = now
      scrollBy(autoScrollPx * dt)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [autoOn, mode, autoPageSec, autoScrollPx, next, scrollBy])

  const exit = useCallback((): void => {
    useReader.getState().exit()
    void useLibrary.getState().load()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        useReader.getState().updateSettings({ mode: mode === 'page' ? 'scroll' : 'page' })
        return
      }
      if (event.key === 'Escape') {
        if (autoOn) setAutoOn(false)
        else if (autoOpen) setAutoOpen(false)
        else if (tocOpen) setTocOpen(false)
        else if (settingsOpen) setSettingsOpen(false)
        else exit()
        return
      }
      if (mode === 'scroll') {
        const scroller = scrollRef.current
        const view = scroller?.clientHeight ?? 600
        if (event.key === ' ' || event.key === 'PageDown') {
          event.preventDefault()
          scrollBy(view * 0.9)
        } else if (event.key === 'PageUp') {
          event.preventDefault()
          scrollBy(-view * 0.9)
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          scrollBy(90)
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          scrollBy(-90)
        }
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        next()
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        prev()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, exit, tocOpen, settingsOpen, mode, scrollBy, autoOn, autoOpen])
  /** 纸张两侧留白即翻页热区；正文区域按实际排版宽度取，和纸张宽度解耦 */
  const onPaperClick = (event: React.MouseEvent): void => {
    const paper = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const x = event.clientX
    /* 纸张之外（深色台面）不响应 */
    if (x < paper.left || x > paper.right) return
    const inner = viewportRef.current?.getBoundingClientRect()
    const left = inner ? inner.left : paper.left
    const right = inner ? inner.right : paper.right
    /* 以正文栏为基准取 28% / 72%，纸张留白自然落在两侧热区里 */
    const leftZone = left + (right - left) * 0.28
    const rightZone = left + (right - left) * 0.72
    /* 只有分页模式点留白翻页；滚动模式只用滚轮/键盘 */
    if (mode !== 'page') return
    if (x < leftZone) prev()
    else if (x > rightZone) next()
  }

  /* 开发/深链： #reader?pw=720&spread=1&anim=cover&mode=page&reset=1 */
  useEffect(() => {
    const raw = location.hash.replace(/^#/, '')
    const [name, query] = raw.split('?')
    if (!name.startsWith('reader')) return
    const params = new URLSearchParams(query ?? '')
    const patch: Partial<ReaderSettings> = {}
    if (params.get('reset') === '1') Object.assign(patch, DEFAULT_SETTINGS)
    if (params.get('mode') === 'scroll' || params.get('mode') === 'page')
      patch.mode = params.get('mode') as ReadingMode
    if (params.get('spread')) patch.spread = params.get('spread') !== '0'
    if (params.get('pw')) patch.pageWidth = Number(params.get('pw')) || 720
    if (params.get('auto')) {
      setAutoOpen(true)
      if (params.get('sec')) setAutoPageSec(Number(params.get('sec')) || 8)
      if (params.get('auto') === 'on') setAutoOn(true)
    }
    if (params.get('tts')) setTtsOpen(true)
    if (params.get('tts') === 'read') {
      window.setTimeout(() => {
        useTts.getState().setSpeed(2)
        useTts.getState().readFrom(0)
      }, 1200)
    }
    if (params.get('tts') === 'test') {
      window.setTimeout(() => void useTts.getState().testVoice(), 900)
    }
    if (Object.keys(patch).length) useReader.getState().updateSettings(patch)
  }, [])

  if (!open || !book) return <div />

  const flowStyle = (pageNumber: number): React.CSSProperties => ({
    width: pageW,
    columnWidth: `${pageW}px`,
    columnGap: `${GAP}px`,
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    ['--pgap' as string]: `${settings.paragraphGap}em`,
    ['--page' as string]: pageNumber,
    ['--step' as string]: `${step}px`,
    ['--pw' as string]: `${pageW}px`
  })

  const renderChapterBody = (withBlocks: boolean): React.ReactNode => (
    <>
      <div className="rd-chaphead">
        <div className="rd-voltag">{chapter?.volumeTitle ?? book.title}</div>
        <h1 className="rd-title">{chapter?.title}</h1>
        <div className="rd-meta">
          <span>{book.author}</span>
          <span>{chapter?.paragraphs.join('').length ?? 0} 字</span>
        </div>
        <div className="rd-rule" />
      </div>
      {chapter?.paragraphs.map((text, index) => {
        const image = text.match(/^\[\[img:(.+)\]\]$/)
        if (image) {
          return (
            <div className="rd-figure" data-block={withBlocks ? index : undefined} key={index}>
              <img src={`wuya-media://book/${book?.id}/${image[1]}`} alt="" />
            </div>
          )
        }
        const mark = highlight && highlight.block === index ? highlight : null
        return (
          <p className="rd-p" data-block={withBlocks ? index : undefined} key={index}>
            {mark ? (
              <>
                {text.slice(0, mark.offset)}
                <mark className="rd-mark">{text.slice(mark.offset, mark.offset + mark.length)}</mark>
                {text.slice(mark.offset + mark.length)}
              </>
            ) : (
              text
            )}
          </p>
        )
      })}
    </>
  )
  return (
    <div
      className={`rd-root ${settingsOpen ? 'settings-open' : ''} ${tocOpen ? 'toc-open' : ''}`}
      data-theme={settings.theme}
      data-font={settings.font}
    >
      <header className="rd-tb">
        <div className="rd-tb-l">
          <button className="iconbtn" type="button" title="返回书架" onClick={exit}>
            <Icon id="i-left" />
          </button>
          <span className="rd-book">{book.title}</span>
          <span className="rd-sep">/</span>
          <span className="rd-vol">{chapter?.volumeTitle ?? '正文'}</span>
        </div>
        <WindowButtons />
      </header>

      <div
        className={`rd-stage ${mode === 'scroll' ? 'is-scroll' : ''} ${spreadActive ? 'is-spread' : ''}`}
      >
        {mode === 'page' ? (
          <div
            className="rd-paper"
            style={{ paddingLeft: paperPad, paddingRight: paperPad }}
            onClick={onPaperClick}
          >
            <div
              className={`rd-viewport ${settings.animation === 'none' ? 'no-anim' : ''}`}
              ref={viewportRef}
              style={{ width: viewWidth }}
            >
              {chapter ? (
                <>
                  {anim ? (
                    <div className={`rd-page anim-${anim.type}`} aria-hidden="true">
                      <div className="rd-flow" style={flowStyle(anim.to)}>
                        {renderChapterBody(false)}
                      </div>
                    </div>
                  ) : null}
                  <div
                    className={`rd-flow ${anim ? `anim-${anim.type}` : ''}`}
                    ref={flowRef}
                    style={flowStyle(anim ? anim.from : page)}
                  >
                    {renderChapterBody(true)}
                  </div>
                </>
              ) : (
                <div className="rd-loading">正在载入…</div>
              )}
            </div>
          </div>
        ) : (
          <div className="rd-paper rd-paper-scroll" style={{ width: viewWidth + paperPad * 2 }}>
            <div
              className="rd-scroll"
              ref={scrollRef}
              onScroll={onScroll}
              style={{
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                ['--pgap' as string]: `${settings.paragraphGap}em`
              }}
            >
              <div className="rd-scroll-inner" style={{ width: settings.pageWidth }}>
              {stream.map((item) => (
                <article className="rd-sec" data-cid={item.id} key={item.id}>
                  <div className="rd-chaphead">
                    <div className="rd-voltag">{item.volumeTitle ?? book.title}</div>
                    <h1 className="rd-title">{item.title}</h1>
                    <div className="rd-meta">
                      <span>{book.author}</span>
                      <span>{item.paragraphs.join('').length} 字</span>
                    </div>
                    <div className="rd-rule" />
                  </div>
                  {item.paragraphs.map((text, index) => {
                    const image = text.match(/^\[\[img:(.+)\]\]$/)
                    if (image) {
                      return (
                        <div className="rd-figure" data-block={index} key={index}>
                          <img src={`wuya-media://book/${book.id}/${image[1]}`} alt="" />
                        </div>
                      )
                    }
                    return (
                      <p className="rd-p" data-block={index} key={index}>
                        {text}
                      </p>
                    )
                  })}
                  <div className="rd-sec-end">· 本章完 ·</div>
                </article>
              ))}
              {stream.length === 0 ? <div className="rd-loading">正在载入…</div> : null}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rd-rail rd-rail-l">
        <button
          className="rail-i"
          type="button"
          title="上一章"
          onClick={() => goChapter(-1)}
        >
          <Icon id="i-left" />
          <span>上一章</span>
        </button>
        <button
          className="rail-i"
          type="button"
          title="下一章"
          onClick={() => goChapter(1)}
        >
          <Icon id="i-right" />
          <span>下一章</span>
        </button>
      </div>

      <div className="rd-rail">
        <button
          className={`rail-i ${tocOpen && drawerTab === 'toc' ? 'on' : ''}`}
          type="button"
          title="目录"
          onClick={() => {
            setDrawerTab('toc')
            setTocOpen(true)
          }}
        >
          <Icon id="i-toc" />
          <span>目录</span>
        </button>
        <button
          className={`rail-i ${tocOpen && drawerTab === 'bookmarks' ? 'on' : ''}`}
          type="button"
          title="书签"
          onClick={() => {
            setDrawerTab('bookmarks')
            setTocOpen(true)
          }}
        >
          <Icon id="i-bm" />
          <span>书签</span>
        </button>
        <button
          className={`rail-i ${tocOpen && drawerTab === 'notes' ? 'on' : ''}`}
          type="button"
          title="笔记"
          onClick={() => {
            setDrawerTab('notes')
            setTocOpen(true)
          }}
        >
          <Icon id="i-note" />
          <span>笔记</span>
        </button>
        <button
          className={`rail-i ${ttsOpen ? 'on' : ''}`}
          type="button"
          title="朗读"
          onClick={() => {
            setSettingsOpen(false)
            setTtsOpen((value) => !value)
          }}
        >
          <Icon id="i-mic" />
          <span>朗读</span>
        </button>
        <button
          className={`rail-i ${settingsOpen ? 'on' : ''}`}
          type="button"
          onClick={() => {
            setTtsOpen(false)
            setSettingsOpen((v) => !v)
          }}
        >
          <Icon id="i-set" />
          <span>设置</span>
        </button>
        <button
          className={`rail-i ${autoOpen ? 'on' : ''}`}
          type="button"
          title="自动阅读"
          onClick={() => {
            setAutoOpen((value) => !value)
            if (!autoOpen) computeSpeed()
          }}
        >
          <Icon id="i-play" />
          <span>自动</span>
        </button>
        <button
          className="rail-i"
          type="button"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen()
            else void document.documentElement.requestFullscreen()
          }}
        >
          <Icon id="i-full" />
          <span>全屏</span>
        </button>
      </div>

      <footer className="rd-foot">
        <div className="rd-g" style={{ width: `${Math.min(100, percent)}%` }} />
        <span>
          第 {chapterIndex + 1} 章 / 共 {chapters.length} 章
        </span>
        <span>
          {mode === 'page' ? `${page + 1} / ${pages} 页 · ` : ''}
          {Math.round(percent)}%
        </span>
      </footer>

      {autoOpen ? (
        <div className="rd-auto">
          <div className="ra-head">
            <span>自动阅读</span>
            <button className="ra-x" type="button" onClick={() => setAutoOpen(false)}>
              <Icon id="i-x" size={12} />
            </button>
          </div>
          <div className="ra-seg">
            <button
              className={mode === 'page' ? 'on' : ''}
              type="button"
              onClick={() => updateSettings({ mode: 'page' })}
            >
              自动翻页
            </button>
            <button
              className={mode === 'scroll' ? 'on' : ''}
              type="button"
              onClick={() => updateSettings({ mode: 'scroll' })}
            >
              自动滚动
            </button>
          </div>
          <div className="ra-speed">
            <span>速度</span>
            <button
              className="ra-step"
              type="button"
              onClick={() =>
                mode === 'page'
                  ? setAutoPageSec((value) => Math.max(2, Math.round((value - 1) * 10) / 10))
                  : setAutoScrollPx((value) => Math.max(10, value - 6))
              }
            >
              −
            </button>
            <b>{mode === 'page' ? `${autoPageSec} 秒/页` : `${autoScrollPx} 像素/秒`}</b>
            <button
              className="ra-step"
              type="button"
              onClick={() =>
                mode === 'page'
                  ? setAutoPageSec((value) => Math.min(90, Math.round((value + 1) * 10) / 10))
                  : setAutoScrollPx((value) => Math.min(240, value + 6))
              }
            >
              +
            </button>
          </div>
          <button className="ra-rec" type="button" onClick={computeSpeed}>
            用我的阅读速度
            {mode === 'page' && speedInfo.page
              ? `（${speedInfo.page} 秒/页）`
              : mode === 'scroll' && speedInfo.scroll
                ? `（${speedInfo.scroll} 像素/秒）`
                : '（先翻几页再试）'}
          </button>
          <p className="ra-tip">按你最近的手动翻页 / 滚动估算，自动速度比实测慢 10%。</p>
          <button
            className={`ra-start ${autoOn ? 'on' : ''}`}
            type="button"
            onClick={() => setAutoOn((value) => !value)}
          >
            <Icon id={autoOn ? 'i-pause' : 'i-play'} size={13} />
            {autoOn ? '暂停' : '开始自动阅读'}
          </button>
        </div>
      ) : null}

      {autoOn ? (
        <button className="rd-auto-pill" type="button" onClick={() => setAutoOn(false)}>
          {mode === 'page'
            ? `自动翻页中 · ${autoPageSec} 秒/页`
            : `自动滚动中 · ${autoScrollPx} 像素/秒`}
          <span>点击停止</span>
        </button>
      ) : null}

      <TocDrawer
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        tab={drawerTab}
        onTabChange={setDrawerTab}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <TtsBall />

      <TtsPanel
        open={ttsOpen}
        onClose={() => setTtsOpen(false)}
        getStartBlock={() =>
          mode === 'page'
            ? (readPageAnchor()?.block ?? 0)
            : (readScrollAnchor()?.anchor.block ?? 0)
        }
      />
    </div>
  )
}
