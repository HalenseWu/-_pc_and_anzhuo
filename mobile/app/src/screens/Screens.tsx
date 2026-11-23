import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReadAnchor } from '../core/types'
import { SettingsSheet } from '../components/SettingsSheet'
import { TocDrawer } from '../components/TocDrawer'
import { pushBackHandler } from '../platform/back'
import { onVolumeKey, setVolumeKeysEnabled } from '../platform/volume-keys'
import { useLibrary, loadChapter, type ChapterContent } from '../store/library'
import { useReader } from '../store/reader'
import { useMarks, type Bookmark, type Note } from '../store/marks'
import { searchBook, type SearchHit } from '../store/library'
import { NoteEditor } from '../components/NoteEditor'
import { useReadingClock } from '../hooks/useReadingClock'
import { useKeepAwake } from '../hooks/useKeepAwake'
import { StatsScreen } from './StatsScreen'
import { PdfReader } from './PdfReader'
import { TocEditorScreen } from './TocEditorScreen'
import { BackupDialog } from '../components/BackupDialog'
import { AutoSheet } from '../components/AutoSheet'
import { useReadAloud } from '../hooks/useReadAloud'
import { segmentParagraph } from '../core/sentences'

const EMPTY_MARKS: Bookmark[] = []
const EMPTY_NOTES: Note[] = []

export function LibraryScreen({
  onOpen,
  onAskExit
}: {
  onOpen: (bookId: string) => void
  onAskExit: () => void
}): React.JSX.Element {
  const books = useLibrary((state) => state.books)
  const load = useLibrary((state) => state.load)
  const importFile = useLibrary((state) => state.importFile)
  const importMany = useLibrary((state) => state.importMany)
  const importProgress = useLibrary((state) => state.importProgress)
  const importing = useLibrary((state) => state.importing)
  const error = useLibrary((state) => state.error)
  const [menu, setMenu] = useState(false)
  const [tab, setTab] = useState<'all' | 'recent'>('all')
  const [statsOpen, setStatsOpen] = useState(() => new URLSearchParams(location.search).has('stats'))
  const [actionBook, setActionBook] = useState<{ id: string; title: string } | null>(null)
  const [editBook, setEditBook] = useState<string | null>(null)
  const [backupOpen, setBackupOpen] = useState(false)
  const [sheet, setSheet] = useState<'menu' | 'rename' | 'delete' | null>(null)
  const [renameText, setRenameText] = useState('')
  const longPressRef = useRef<number | null>(null)
  const longPressedRef = useRef(false)
  const lastBackRef = useRef(0)
  const [backTip, setBackTip] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () =>
      pushBackHandler(() => {
        if (menu) {
          setMenu(false)
          return true
        }
        if (sheet) {
          setSheet(null)
          setActionBook(null)
          return true
        }
        const now = Date.now()
        /* 两秒内再按一次才弹退出确认，避免误触 */
        if (now - lastBackRef.current < 2000) {
          lastBackRef.current = 0
          setBackTip(null)
          onAskExit()
          return true
        }
        lastBackRef.current = now
        setBackTip('再按一次返回键退出')
        return true
      }),
    [menu, sheet, onAskExit]
  )

  useEffect(() => {
    if (!backTip) return
    const timer = window.setTimeout(() => setBackTip(null), 2000)
    return () => window.clearTimeout(timer)
  }, [backTip])

  const list = [...books].sort((a, b) => {
    if (tab === 'recent') return (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0)
    return b.addedAt - a.addedAt
  })

  return (
    <div className="screen library">
      <header className="lib-head">
        <h1>书架</h1>
        <button className="icon-btn" type="button" onClick={() => setMenu((value) => !value)}>
          ⋯
        </button>
        {menu ? (
          <div className="menu" onClick={() => setMenu(false)}>
            <button type="button" onClick={() => inputRef.current?.click()}>
              导入书籍
            </button>
            <button type="button" disabled>
              编辑书架（待做）
            </button>
            <button type="button" onClick={() => setStatsOpen(true)}>
              阅读统计
            </button>
            <button type="button" onClick={() => setBackupOpen(true)}>
              备份与恢复
            </button>
          </div>
        ) : null}
      </header>

      <div className="lib-banner">
        <span className="banner-num">{books.length}</span>
        <span className="banner-label">本藏书 · 本地导入</span>
      </div>

      <div className="lib-tabs">
        <button type="button" className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
          全部
        </button>
        <button type="button" className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>
          最近
        </button>
      </div>

      {error ? <div className="lib-error">{error}</div> : null}

      <div className="grid">
        {list.map((book) => (
          <button
            key={book.id}
            type="button"
            className="book"
            onPointerDown={() => {
              longPressedRef.current = false
              longPressRef.current = window.setTimeout(() => {
                longPressedRef.current = true
                setActionBook({ id: book.id, title: book.title })
                setSheet('menu')
              }, 2000)
            }}
            onPointerUp={() => {
              if (longPressRef.current) window.clearTimeout(longPressRef.current)
            }}
            onPointerLeave={() => {
              if (longPressRef.current) window.clearTimeout(longPressRef.current)
            }}
            onClick={() => {
              if (longPressedRef.current) {
                longPressedRef.current = false
                return
              }
              onOpen(book.id)
            }}
          >
            <div className="cover" style={{ background: `linear-gradient(160deg, ${book.cover[0]}, ${book.cover[1]})` }}>
              {book.coverImage ? (
                <img className="cover-img" src={book.coverImage} alt="" />
              ) : (
                <span className="cover-title">{book.title.slice(0, 4)}</span>
              )}
              <span className="cover-format">{book.format}</span>
              {book.progress > 0 ? <span className="cover-progress">{book.progress}%</span> : null}
            </div>
            <span className="book-title">{book.title}</span>
          </button>
        ))}

        <button type="button" className="book add" onClick={() => inputRef.current?.click()}>
          <div className="cover add-cover">
            {importProgress ? `${importProgress.done + 1}/${importProgress.total}` : importing ? '导入中…' : '+'}
          </div>
          <span className="book-title">导入</span>
        </button>
      </div>

      {actionBook && sheet === 'menu' ? (
        <div className="dialog-scrim" onClick={() => setSheet(null)}>
          <div className="dialog action-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>{actionBook.title}</h3>
            <button
              type="button"
              className="action-row"
              onClick={() => {
                setRenameText(actionBook.title)
                setSheet('rename')
              }}
            >
              重命名
            </button>
            <button
              type="button"
              className="action-row"
              onClick={() => {
                setEditBook(actionBook.id)
                setSheet(null)
              }}
            >
              目录编辑
            </button>
            <button type="button" className="action-row danger" onClick={() => setSheet('delete')}>
              删除
            </button>
            <button type="button" className="action-row muted" disabled>
              隐藏（暂未开放）
            </button>
            <button type="button" className="action-row muted" onClick={() => setSheet(null)}>
              取消
            </button>
          </div>
        </div>
      ) : null}

      {actionBook && sheet === 'rename' ? (
        <div className="dialog-scrim" onClick={() => setSheet('menu')}>
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
            <h3>重命名</h3>
            <input
              className="dialog-input"
              value={renameText}
              onChange={(event) => setRenameText(event.target.value)}
              autoFocus
            />
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setSheet('menu')}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                disabled={!renameText.trim()}
                onClick={() => {
                  void useLibrary.getState().update(actionBook.id, { title: renameText.trim() })
                  setSheet(null)
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actionBook && sheet === 'delete' ? (
        <div className="dialog-scrim" onClick={() => setSheet('menu')}>
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
            <h3>删除这本书？</h3>
            <p>会同时删除正文、书签和笔记，无法恢复。</p>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setSheet('menu')}>
                取消
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void useLibrary.getState().removeBook(actionBook.id)
                  setSheet(null)
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editBook ? (
        <TocEditorScreen
          book={books.find((item) => item.id === editBook)!}
          onClose={() => setEditBook(null)}
        />
      ) : null}

      {backTip ? <div className="toast">{backTip}</div> : null}

      <BackupDialog open={backupOpen} onClose={() => setBackupOpen(false)} />

      {statsOpen ? <StatsScreen onClose={() => setStatsOpen(false)} /> : null}

      <input
        ref={inputRef}
        type="file"
        accept=".txt,.epub,text/plain,application/epub+zip"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length === 1) void importFile(files[0])
          else if (files.length > 1) void importMany(files)
        }}
      />
    </div>
  )
}

export function ReaderScreen({ bookId, onBack }: { bookId: string; onBack: () => void }): React.JSX.Element {
  const open = useReader((state) => state.open)
  const book = useReader((state) => state.book)
  const chapter = useReader((state) => state.chapter)

  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    setReady(false)
    void open(bookId).then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [bookId, open])

  if (book && book.id === bookId && book.format === 'PDF') {
    return <PdfReader key={book.id} book={book} onBack={onBack} />
  }

  /* 换了书但新书还没载入完，不能继续显示上一本 */
  if (!ready || !book || book.id !== bookId || !chapter) {
    return (
      <div className="screen loading">
        <span>正在载入…</span>
      </div>
    )
  }

  return <ReaderBody key={book.id} onBack={onBack} />
}

/** 估算某一段所在的栏（页） */
function pageOfBlock(flow: HTMLElement, block: number, columnStep: number): number {
  const node = flow.querySelector<HTMLElement>(`.rd-p[data-block="${block}"]`)
  if (!node) return 0
  return Math.max(0, Math.round(node.offsetLeft / columnStep))
}

/** 某一页上的第一段 */
function firstBlockOfPage(flow: HTMLElement, page: number, step: number): number {
  const nodes = Array.from(flow.querySelectorAll<HTMLElement>('.rd-p'))
  for (const node of nodes) {
    const nodePage = Math.floor((node.offsetLeft + 2) / step)
    if (nodePage === page) return Number(node.dataset.block ?? 0)
  }
  return blockOfPage(flow, page, step)
}

function blockOfPage(flow: HTMLElement, page: number, columnStep: number): number {
  const nodes = Array.from(flow.querySelectorAll<HTMLElement>('.rd-p'))
  let current = 0
  for (const node of nodes) {
    const nodePage = Math.max(0, Math.round(node.offsetLeft / columnStep))
    if (nodePage <= page) current = Number(node.dataset.block ?? 0)
    else break
  }
  return current
}

function ReaderBody({ onBack }: { onBack: () => void }): React.JSX.Element {
  const settings = useReader((state) => state.settings)
  const chapters = useReader((state) => state.chapters)
  const chapter = useReader((state) => state.chapter)
  const page = useReader((state) => state.page)
  const pages = useReader((state) => state.pages)
  const setPage = useReader((state) => state.setPage)
  const setPages = useReader((state) => state.setPages)
  const goChapter = useReader((state) => state.goChapter)
  const savePosition = useReader((state) => state.savePosition)
  const gotoEnd = useReader((state) => state.gotoEnd)
  const clearGotoEnd = useReader((state) => state.clearGotoEnd)
  const anchor = useReader((state) => state.anchor)
  const book = useReader((state) => state.book)
  const marksMap = useMarks((state) => state.byBook)
  const loadMarks = useMarks((state) => state.load)

  useReadingClock(book?.id ?? null)
  const bumpKeepAwake = useKeepAwake(settings.keepAwake > 0, settings.keepAwake)

  const stageRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [fontsReady, setFontsReady] = useState(false)
  const [chrome, setChrome] = useState(() => !new URLSearchParams(location.search).has('plain'))
  const [toc, setToc] = useState(() => new URLSearchParams(location.search).has('toc'))
  const [tocTab, setTocTab] = useState<'toc' | 'search'>('toc')
  const [sheet, setSheet] = useState(() => new URLSearchParams(location.search).has('sheet'))
  const [turning, setTurning] = useState<'next' | 'prev' | null>(null)
  const [stream, setStream] = useState<ChapterContent[]>([])
  const [currentBlock, setCurrentBlock] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [instantTurn, setInstantTurn] = useState(false)
  const [readPanel, setReadPanel] = useState(false)
  const [readBall, setReadBall] = useState(false)
  const prevPageRef = useRef(0)
  const [autoOpen, setAutoOpen] = useState(false)
  const [autoOn, setAutoOn] = useState(false)
  const [speedInfo, setSpeedInfo] = useState<{ page: number | null; scroll: number | null }>({
    page: null,
    scroll: null
  })
  const turnsRef = useRef<number[]>([])
  const scrollSamples = useRef<{ t: number; top: number }[]>([])
  const turnRef = useRef<((delta: number, manual?: boolean) => void) | null>(null)
  const lastScrollRef = useRef(0)
  const centerRef = useRef<{ chapterId: string | null; block: number }>({ chapterId: null, block: 0 })
  const wasScrollRef = useRef(false)
  const suppressRef = useRef(0)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteQuote, setNoteQuote] = useState('')
  const blockRef = useRef(0)
  const restoreRef = useRef<ReadAnchor | null>(anchor)
  const intentRef = useRef(false)
  const loadingRef = useRef(false)
  const gap = 48
  const contentWidth = Math.max(0, size.width - settings.margin * 2)
  const scrollMode = settings.mode === 'scroll'

  /* 滚动模式：从当前章开始铺流 */
  useEffect(() => {
    if (!scrollMode || !chapter) return
    if (!intentRef.current) return
    intentRef.current = false
    suppressRef.current = Date.now() + 900
    lastScrollRef.current = 0
    setStream([chapter])
    loadingRef.current = false
    const scroller = scrollRef.current
    if (scroller) scroller.scrollTop = 0
  }, [scrollMode, chapter])

  /* 从翻页切到滚动时，重新铺流 */
  useEffect(() => {
    if (scrollMode) wasScrollRef.current = true
    if (!scrollMode || !chapter) return
    intentRef.current = false
    setStream([chapter])
    loadingRef.current = false
  }, [scrollMode])

  useEffect(
    () =>
      pushBackHandler(() => {
        if (sheet) {
          setSheet(false)
          return true
        }
        if (toc) {
          setToc(false)
          return true
        }
        onBack()
        return true
      }),
    [sheet, toc, onBack]
  )

  useEffect(() => {
    let alive = true
    void document.fonts.ready.then(() => {
      if (alive) setFontsReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (book) void loadMarks(book.id)
  }, [book, loadMarks])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      /* 从滚动模式切回翻页时，舞台是这一帧才挂上的 */
      if (!scrollMode) setSize({ width: 0, height: 0 })
      return
    }
    const measure = (): void => setSize({ width: stage.clientWidth, height: stage.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [scrollMode])

  /* 音量键翻页：只在阅读页接管，退出时还给系统 */
  useEffect(() => {
    /* 只在翻页模式接管音量键；滚动模式还给系统 */
    if (!settings.volumeKeys || scrollMode) {
      void setVolumeKeysEnabled(false)
      return
    }
    void setVolumeKeysEnabled(true)
    let dispose: (() => void) | null = null
    let cancelled = false
    void onVolumeKey((direction) => {
      turnRef.current?.(direction === 'down' ? 1 : -1)
    }).then((off) => {
      if (cancelled) off()
      else dispose = off
    })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [settings.volumeKeys, scrollMode])

  /* 分页模式：算页数 + 还原位置 */
  useLayoutEffect(() => {
    const flow = flowRef.current
    if (scrollMode || !flow || contentWidth === 0 || !fontsReady) return
    const step = contentWidth + gap
    const total = Math.max(1, Math.round((flow.scrollWidth + gap) / step))
    setPages(total)
    if (wasScrollRef.current) {
      wasScrollRef.current = false
      const center = centerRef.current
      const target = Math.min(total - 1, pageOfBlock(flow, center.block, step))
      if (target !== page) setPage(target)
      blockRef.current = center.block
      setCurrentBlock(center.block)
      savePosition(chapter?.id ?? '', center.block, total > 1 ? target / total : 0, target)
      return
    }
    const visibleBlock = blockOfPage(flow, Math.min(page, total - 1), step)
    blockRef.current = visibleBlock
    setCurrentBlock(visibleBlock)
    const pending = restoreRef.current
    if (pending) {
      restoreRef.current = null
      const target =
        pending.page !== undefined
          ? Math.min(total - 1, pending.page)
          : Math.min(total - 1, pageOfBlock(flow, pending.block, step))
      if (target !== page) setPage(target)
      if (chapter) savePosition(chapter.id, pending.block, total > 1 ? target / total : 0, target)
      return
    }
    if (gotoEnd) {
      clearGotoEnd()
      /* 等一帧再量一次，避免刚换章时把总页数算成 1 而落到首页 */
      window.requestAnimationFrame(() => {
        const node = flowRef.current
        if (!node) return
        const nextStep = contentWidth + gap
        const fresh = Math.max(1, Math.round((node.scrollWidth + gap) / nextStep))
        setPages(fresh)
        const target = fresh - 1
        setPage(target)
        if (chapter) savePosition(chapter.id, blockOfPage(node, target, nextStep), fresh > 1 ? target / fresh : 0, target)
      })
      return
    }
    if (page > total - 1) setPage(total - 1)
  }, [chapter, settings.fontSize, settings.lineHeight, settings.fontId, settings.margin, settings.paragraphGap, contentWidth, gap, page, setPage, setPages, scrollMode, fontsReady, gotoEnd, clearGotoEnd])

  /* 滚动模式：还原到锚点 / 接近底部续接下一章 */
  useLayoutEffect(() => {
    if (!scrollMode) return
    const scroller = scrollRef.current
    if (!scroller) return
    const pending = restoreRef.current
    if (pending) {
      restoreRef.current = null
      const node = scroller.querySelector<HTMLElement>(`[data-cid="${chapter?.id ?? ''}"] .rd-p[data-block="${pending.block}"]`)
      if (node) scroller.scrollTop = Math.max(0, node.offsetTop - 12)
    }
    if (fontsReady && scroller.scrollHeight <= scroller.clientHeight + 40) {
      void appendNext()
    }
  }, [scrollMode, chapter, stream.length])

  if (!chapter) {
    return (
      <div className="screen loading">
        <span>正在载入…</span>
      </div>
    )
  }

  const marks = book ? marksMap[book.id] ?? EMPTY_MARKS : EMPTY_MARKS
  const notesMap = useMarks((state) => state.notesByBook)
  const notes = book ? notesMap[book.id] ?? EMPTY_NOTES : EMPTY_NOTES
  const currentIndex = chapter.index

  const turn = (delta: number, manual = true): void => {
    if (turning) return
    if (manual) turnsRef.current = [...turnsRef.current.slice(-11), Date.now()]
    const target = page + delta
    if (target < 0) {
      if (currentIndex > 0) void goChapter(currentIndex - 1, null, true)
      return
    }
    if (target >= pages) {
      if (currentIndex < chapters.length - 1) void goChapter(currentIndex + 1)
      return
    }
    bumpKeepAwake()
    setTurning(delta > 0 ? 'next' : 'prev')
    window.setTimeout(() => {
      setPage(target)
      setTurning(null)
      const flow = flowRef.current
      if (flow) {
        const step = contentWidth + gap
        savePosition(chapter.id, blockOfPage(flow, target, step), pages > 1 ? target / pages : 0, target)
      }
    }, settings.animation === 'none' ? 0 : 180)
  }

  useEffect(() => {
    turnRef.current = turn
  })

  /* 一次跨多页时直接跳，避免滑过中间页面造成“正文偏左”的错觉 */
  useEffect(() => {
    const delta = Math.abs(page - prevPageRef.current)
    prevPageRef.current = page
    if (delta <= 1) return
    setInstantTurn(true)
    const timer = window.setTimeout(() => setInstantTurn(false), 60)
    return () => window.clearTimeout(timer)
  }, [page])

  /* 用最近的手动节奏推荐速度：翻页间隔 ×1.1，滚动速度 ×0.9 */
  const computeSpeed = (): void => {
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
  }

  /* 自动翻页 / 自动滚动 */
  useEffect(() => {
    if (!autoOn) return
    if (!scrollMode) {
      const timer = window.setInterval(() => {
        turnRef.current?.(1, false)
      }, Math.max(2, settings.autoPageSec) * 1000)
      return () => window.clearInterval(timer)
    }
    let raf = 0
    let last = performance.now()
    let carry = 0
    const tick = (now: number): void => {
      const dt = Math.min(0.08, (now - last) / 1000)
      last = now
      const scroller = scrollRef.current
      if (scroller) {
        carry += settings.autoScrollPx * dt
        if (carry >= 0.5) {
          scroller.scrollTop += carry
          carry = 0
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [autoOn, scrollMode, settings.autoPageSec, settings.autoScrollPx])

  const onClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (scrollMode) {
      setChrome((value) => !value)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    if (x < rect.width * 0.3) {
      turn(-1)
      return
    }
    if (x > rect.width * 0.7) {
      turn(1)
      return
    }
    setChrome((value) => !value)
  }

  const appendNext = async (): Promise<void> => {
    const scroller = scrollRef.current
    if (!scroller || loadingRef.current || !book) return
    const last = stream[stream.length - 1]
    if (!last) return
    if (last.index >= chapters.length - 1) return
    loadingRef.current = true
    try {
      const next = await loadChapter(book, chapters[last.index + 1], last.index + 1)
      if (next) setStream((list) => (list.some((item) => item.id === next.id) ? list : [...list, next]))
    } finally {
      window.setTimeout(() => {
        loadingRef.current = false
      }, 300)
    }
  }

  const prependPrev = async (): Promise<void> => {
    const scroller = scrollRef.current
    if (!scroller || loadingRef.current || !book) return
    const first = stream[0]
    if (!first || first.index <= 0) return
    loadingRef.current = true
    try {
      const prev = await loadChapter(book, chapters[first.index - 1], first.index - 1)
      if (!prev) return
      const before = scroller.scrollHeight
      setStream((list) => (list.some((item) => item.id === prev.id) ? list : [prev, ...list]))
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const node = scrollRef.current
          if (node) node.scrollTop += node.scrollHeight - before
        })
      })
    } finally {
      window.setTimeout(() => {
        loadingRef.current = false
      }, 300)
    }
  }

  const onScroll = (): void => {
    bumpKeepAwake()
    /* 记录视口中心位置，切回翻页模式时按“占比超过一半的那一页”落位 */
    const centerScroller = scrollRef.current
    if (centerScroller) {
      const centerY = centerScroller.scrollTop + centerScroller.clientHeight / 2 - 1
      let centerSection: HTMLElement | null = null
      for (const node of Array.from(centerScroller.querySelectorAll<HTMLElement>('.rd-sec'))) {
        if (node.offsetTop <= centerY) centerSection = node
        else break
      }
      if (centerSection) {
        let centerBlock = 0
        for (const node of Array.from(centerSection.querySelectorAll<HTMLElement>('.rd-p'))) {
          if (node.offsetTop <= centerY) centerBlock = Number(node.dataset.block ?? 0)
          else break
        }
        centerRef.current = { chapterId: centerSection.dataset.cid ?? null, block: centerBlock }
      }
    }
    const sampled = scrollRef.current
    if (sampled) {
      const samples = scrollSamples.current
      samples.push({ t: performance.now(), top: sampled.scrollTop })
      if (samples.length > 40) samples.shift()
    }
    const scroller = scrollRef.current
    if (!scroller || !scrollMode) return
    const scrollTop = scroller.scrollTop
    const delta = scrollTop - lastScrollRef.current
    lastScrollRef.current = scrollTop
    if (Date.now() < suppressRef.current) return
    /* 只有往下滚才续章，只有往上滚才补章，避免刚跳章就误触发 */
    if (delta > 0 && scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1200) void appendNext()
    if (delta < 0 && scrollTop < 240) void prependPrev()
    const top = scrollTop + 60
    let active = stream[stream.length - 1]
    for (const item of stream) {
      const section = scroller.querySelector<HTMLElement>(`[data-cid="${item.id}"]`)
      if (section && section.offsetTop <= top) active = item
    }
    if (!active) return
    const section = scroller.querySelector<HTMLElement>(`[data-cid="${active.id}"]`)
    if (!section) return
    let block = 0
    for (const node of Array.from(section.querySelectorAll<HTMLElement>('.rd-p'))) {
      if (node.offsetTop <= top) block = Number(node.dataset.block ?? 0)
      else break
    }
    blockRef.current = block
    setCurrentBlock(block)
    const ratio = active.chars > 0 ? Math.min(1, (top - section.offsetTop) / Math.max(1, section.offsetHeight)) : 0
    savePosition(active.id, block, ratio)
    if (active.id !== chapter.id) {
      const target = chapters.find((item) => item.id === active.id)
      if (target) {
        useReader.setState({ chapter: active })
        void useLibrary.getState().update(book!.id, { currentChapterId: active.id })
      }
    }
  }

  const read = useReadAloud({
    chapter,
    chapters,
    rate: settings.ttsRate,
    follow: settings.ttsFollow,
    engine: settings.ttsEngine,
    onFollow: (block, seg) => {
      if (scrollMode) {
        const node = scrollRef.current?.querySelector<HTMLElement>(
          `[data-cid="${chapter?.id ?? ''}"] [data-block="${block}"] .rd-seg[data-seg="${seg}"]`
        )
        node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      const flow = flowRef.current
      if (!flow || contentWidth <= 0) return
      const target = pageOfBlock(flow, block, contentWidth + gap)
      if (target !== page) setPage(target)
    },
    onNeedChapter: async (index) => {
      if (!book || !chapters[index]) return null
      return await loadChapter(book, chapters[index], index)
    },
    onChapterChange: (index) => {
      void goChapter(index)
    }
  })

  /* 点「听」只展开/收起面板，不直接开始朗读 */
  const toggleReadPanel = (): void => {
    if (readBall) {
      setReadBall(false)
      setReadPanel(true)
      return
    }
    if (readPanel) {
      /* 正在读的时候再点「听」= 收成悬浮球 */
      setReadPanel(false)
      if (read.active) setReadBall(true)
      return
    }
    setReadPanel(true)
  }

  /* 面板里的播放键：没开始时才真正启动朗读 */
  const onReadPlay = (): void => {
    if (!read.active) {
      const flow = flowRef.current
      const startBlock =
        !scrollMode && flow && contentWidth > 0
          ? firstBlockOfPage(flow, page, contentWidth + gap)
          : blockRef.current
      void read.start(startBlock, 0)
      return
    }
    if (read.playing) void read.pause()
    else void read.resume()
  }

  const collapseRead = (): void => {
    setReadPanel(false)
    if (read.active) setReadBall(true)
  }

  const exitRead = (): void => {
    void read.stop()
    setReadPanel(false)
    setReadBall(false)
  }

  const cycleRate = (): void => {
    const steps = [0.8, 1, 1.2, 1.5, 1.8]
    const next = steps[(steps.indexOf(settings.ttsRate) + 1) % steps.length] ?? 1
    useReader.getState().updateSettings({ ttsRate: next })
  }

  const cycleSleep = (): void => {
    const steps = [0, 15, 30, 60]
    const next = steps[(steps.indexOf(read.sleepMinutes) + 1) % steps.length]
    read.setSleepMinutes(next ?? 0)
  }

  const renderParagraph = (text: string, blockIndex: number, chapterId: string): React.JSX.Element => {
    const segments = segmentParagraph(text)
    const activeSeg =
      read.position && read.position.chapterId === chapterId && read.position.block === blockIndex
        ? read.position.seg
        : -1
    if (segments.length <= 1 && activeSeg < 0) {
      return (
        <p className="rd-p" data-block={blockIndex} key={blockIndex}>
          {text}
        </p>
      )
    }
    return (
      <p className="rd-p" data-block={blockIndex} key={blockIndex}>
        {segments.map((segment, segIndex) => (
          <span
            className={`rd-seg${segIndex === activeSeg ? ' on' : ''}`}
            data-seg={segIndex}
            key={segIndex}
          >
            {segment.text}
          </span>
        ))}
      </p>
    )
  }

  const percent = scrollMode ? 0 : Math.round(((page + 1) / Math.max(1, pages)) * 100)

  return (
    <div
      className={`screen reader theme-${settings.theme} ${chrome ? 'chrome' : 'nochrome'} ${scrollMode ? 'is-scroll' : ''} ${read.active ? 'reading' : ''}`}
      data-font={settings.fontId}
      style={{
        ['--font-size' as string]: `${settings.fontSize}px`,
        ['--line-height' as string]: settings.lineHeight,
        ['--para-gap' as string]: `${settings.paragraphGap}em`,
        ['--margin' as string]: `${settings.margin}px`
      }}
    >
      <header className="rd-top">
        <button className="ghost" type="button" onClick={onBack}>
          ‹
        </button>
        <span className="chap">{chapter.title}</span>
        <button
          className={`ghost ${book && useMarks.getState().find(book.id, chapter.id, currentBlock) ? 'mark-on' : ''}`}
          type="button"
          onClick={() => {
            if (!book || !chapter) return
            const existing = useMarks.getState().find(book.id, chapter.id, blockRef.current)
            if (existing) {
              void useMarks.getState().remove(book.id, existing.id)
              setToast('已删除书签')
              return
            }
            const text = (chapter.paragraphs[blockRef.current] ?? '').slice(0, 42)
            void useMarks
              .getState()
              .add(book.id, {
                chapterId: chapter.id,
                chapterTitle: chapter.title,
                block: blockRef.current,
                text
              })
              .then((ok) => setToast(ok ? '已加入书签' : '这里已经有书签了'))
          }}
        >
          书签
        </button>
        <button
          className={`ghost ${readPanel || readBall ? 'mark-on' : ''}`}
          type="button"
          onClick={toggleReadPanel}
        >
          听
        </button>
        <button
          className="ghost"
          type="button"
          onClick={() => {
            setTocTab('search')
            setToc(true)
          }}
        >
          搜索
        </button>
      </header>

      {scrollMode ? (
        <div className="rd-scroll" ref={scrollRef} onScroll={onScroll} onClick={onClick}>
          {stream.map((item) => (
            <article className="rd-sec" data-cid={item.id} key={item.id}>
              <h2 className="rd-sec-title">{item.title}</h2>
              {item.paragraphs.map((text, index) => renderParagraph(text, index, item.id))}
              <div className="rd-sec-end">· 本章完 ·</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rd-stage" ref={stageRef} onClick={onClick}>
          {contentWidth > 0 ? (
            <div
              className={`rd-flow ${turning ? `turn-${turning}` : ''} anim-${settings.animation}${instantTurn ? ' instant' : ''}`}
              ref={flowRef}
              style={{
                columnWidth: `${contentWidth}px`,
                columnGap: `${gap}px`,
                transform: `translateX(-${page * (contentWidth + gap)}px)`
              }}
            >
              <h2 className="rd-sec-title rd-flow-title">{chapter.title}</h2>
              {chapter.paragraphs.map((text, index) => renderParagraph(text, index, chapter.id))}
            </div>
          ) : null}
        </div>
      )}

      <footer className="rd-bottom">
        {scrollMode ? null : (
          <>
            <span>
              {page + 1}/{pages}
            </span>
            <span>{percent}%</span>
            <span className="chapter-index">
              {chapter.index + 1}/{chapters.length}
            </span>
          </>
        )}
      </footer>

      <SettingsSheet open={sheet} onClose={() => setSheet(false)} />

      <TocDrawer
        open={toc}
        initialTab={tocTab}
        chapters={chapters}
        currentId={chapter.id}
        marks={marks}
        notes={notes}
        onAddNote={() => {
          const quote = (chapter.paragraphs[blockRef.current] ?? '').slice(0, 60)
          setNoteQuote(quote)
          setNoteOpen(true)
        }}
        onPickNote={(note) => {
          const index = chapters.findIndex((item) => item.id === note.chapterId)
          if (index < 0) return
          restoreRef.current = { block: note.block, offset: 0 }
          intentRef.current = true
          void goChapter(index, { block: note.block, offset: 0 })
        }}
        onDeleteNote={(id) => {
          if (book) void useMarks.getState().removeNote(book.id, id)
        }}
        onSearch={async (keyword) => {
          if (!book) return [] as SearchHit[]
          return searchBook(book.id, chapters, keyword)
        }}
        onPickHit={(hit) => {
          restoreRef.current = { block: hit.block, offset: 0 }
          intentRef.current = true
          void goChapter(hit.chapterIndex, { block: hit.block, offset: 0 })
        }}
        onClose={() => setToc(false)}
        onPick={(index) => {
          intentRef.current = true
          suppressRef.current = Date.now() + 900
          void goChapter(index)
        }}
        onPickMark={(mark) => {
          const index = chapters.findIndex((item) => item.id === mark.chapterId)
          if (index < 0) return
          restoreRef.current = { block: mark.block, offset: 0 }
          intentRef.current = true
          void goChapter(index, { block: mark.block, offset: 0 })
        }}
        onDeleteMark={(id) => {
          if (book) void useMarks.getState().remove(book.id, id)
        }}
      />

      <NoteEditor
        open={noteOpen}
        quote={noteQuote}
        onCancel={() => setNoteOpen(false)}
        onSave={(body) => {
          if (!book) return
          void useMarks.getState().addNote(book.id, {
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            block: blockRef.current,
            quote: noteQuote,
            body
          })
          setNoteOpen(false)
          setToast('笔记已保存')
        }}
      />

      <AutoSheet
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        running={autoOn}
        mode={scrollMode ? 'scroll' : 'page'}
        pageSec={settings.autoPageSec}
        scrollPx={settings.autoScrollPx}
        suggestedPage={speedInfo.page}
        suggestedScroll={speedInfo.scroll}
        onPageSec={(value) => useReader.getState().updateSettings({ autoPageSec: value })}
        onScrollPx={(value) => useReader.getState().updateSettings({ autoScrollPx: value })}
        onToggle={() => setAutoOn((value) => !value)}
        onUseSuggestion={() => {
          const info = speedInfo
          if (scrollMode && info.scroll) useReader.getState().updateSettings({ autoScrollPx: info.scroll })
          if (!scrollMode && info.page) useReader.getState().updateSettings({ autoPageSec: info.page })
        }}
      />

      {readPanel ? (
        <div className="read-bar">
          <button type="button" onClick={() => void read.prev()} aria-label="上一句" disabled={!read.active}>
            ⏮
          </button>
          <button type="button" className="read-main" onClick={onReadPlay}>
            {read.active ? (read.playing ? '⏸' : '▶') : '▶'}
          </button>
          <button type="button" onClick={() => void read.next()} aria-label="下一句" disabled={!read.active}>
            ⏭
          </button>
          <button type="button" onClick={cycleRate}>
            {settings.ttsRate.toFixed(1)}×
          </button>
          <button type="button" onClick={cycleSleep}>
            {read.sleepLeft > 0 ? `${Math.max(1, Math.ceil(read.sleepLeft / 60))}′` : '定时'}
          </button>
          <button type="button" onClick={collapseRead}>
            收起
          </button>
          <button type="button" onClick={exitRead}>
            退出
          </button>
        </div>
      ) : null}

      {readBall && read.active ? (
        <button
          type="button"
          className={`read-ball ${read.playing ? 'playing' : ''}`}
          onClick={() => {
            setReadBall(false)
            setReadPanel(true)
          }}
          aria-label="展开朗读"
        >
          {read.playing ? '⏸' : '▶'}
        </button>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}

      {chrome ? (
        <div className="rd-tools">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => {
              intentRef.current = true
              void goChapter(currentIndex - 1)
            }}
          >
            上一章
          </button>
          <button
            type="button"
            onClick={() => {
              setTocTab('toc')
              setToc(true)
            }}
          >
            目录
          </button>
          <button type="button" onClick={() => setSheet((value) => !value)}>
            设置
          </button>
          <button
            type="button"
            className={autoOn ? 'auto-on' : ''}
            onClick={() => {
              computeSpeed()
              setAutoOpen(true)
            }}
          >
            {autoOn ? '自动中' : '自动'}
          </button>
          <button
            type="button"
            disabled={currentIndex >= chapters.length - 1}
            onClick={() => {
              intentRef.current = true
              void goChapter(currentIndex + 1)
            }}
          >
            下一章
          </button>
        </div>
      ) : null}
    </div>
  )
}
