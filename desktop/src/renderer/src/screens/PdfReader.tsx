import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { BookMeta } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { WindowButtons } from '../components/WindowButtons'
import { useLibrary } from '../stores/library'
import { useMarks } from '../stores/marks'
import { useReadingClock } from '../hooks/useReadingClock'
import { useReader } from '../stores/reader'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface OutlineItem {
  title: string
  page: number
  depth: number
}

interface SearchHit {
  page: number
  before: string
  match: string
  after: string
}

/** 单页渲染：canvas + 文字层 */
function PdfPageView({
  doc,
  pageNumber,
  maxWidth,
  zoom,
  dark,
  highlight
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  maxWidth: number
  zoom: number
  dark: boolean
  highlight: string
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const taskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy['render']> | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    const layer = layerRef.current
    if (!canvas || !layer || maxWidth <= 0) return
    let cancelled = false
    void (async () => {
      const pageObj = await doc.getPage(pageNumber)
      if (cancelled) return
      const base = pageObj.getViewport({ scale: 1 })
      const fit = Math.min(2.4, Math.max(0.25, maxWidth / base.width))
      const target = zoom > 0 ? zoom : fit
      const dpr = window.devicePixelRatio || 1
      const cssViewport = pageObj.getViewport({ scale: target })
      const renderViewport = pageObj.getViewport({ scale: target * dpr })

      canvas.width = Math.floor(renderViewport.width)
      canvas.height = Math.floor(renderViewport.height)
      canvas.style.width = `${Math.floor(cssViewport.width)}px`
      canvas.style.height = `${Math.floor(cssViewport.height)}px`
      setSize({ width: Math.floor(cssViewport.width), height: Math.floor(cssViewport.height) })

      const context = canvas.getContext('2d')
      if (!context) return
      // 同一块 canvas 上的上一次渲染必须先取消，否则会叠出偏移/翻转的残影
      taskRef.current?.cancel()
      const task = pageObj.render({ canvasContext: context, viewport: renderViewport })
      taskRef.current = task
      await task.promise.catch(() => undefined)
      if (cancelled) return

      layer.textContent = ''
      layer.style.width = `${Math.floor(cssViewport.width)}px`
      layer.style.height = `${Math.floor(cssViewport.height)}px`
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: await pageObj.getTextContent(),
        container: layer,
        viewport: cssViewport
      })
      await textLayer.render()
      if (cancelled) return

      const term = highlight.trim().toLowerCase()
      if (term) {
        for (const span of layer.querySelectorAll('span')) {
          if ((span.textContent ?? '').toLowerCase().includes(term)) span.classList.add('pdf-hit')
        }
      }
    })()
    return () => {
      cancelled = true
      taskRef.current?.cancel()
    }
  }, [doc, pageNumber, maxWidth, zoom, highlight])

  return (
    <div className="pdf-page" style={{ width: size.width, height: size.height }}>
      <canvas ref={canvasRef} className={dark ? 'pdf-canvas pdf-dark' : 'pdf-canvas'} />
      <div ref={layerRef} className={dark ? 'textLayer pdf-dark' : 'textLayer'} />
    </div>
  )
}

export function PdfReader({ book }: { book: BookMeta }): React.JSX.Element {
  const hashParams = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const initialQuery = hashParams.get('pq') ?? ''
  const theme = useReader((state) => state.settings.theme)
  const spread = useReader((state) => state.settings.spread)
  const exit = useReader((state) => state.exit)
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState(book.pageCount || 0)
  const [page, setPage] = useState(() => Math.max(1, (book.anchor?.block ?? 0) + 1))
  const [scale, setScale] = useState(0)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [tocOpen, setTocOpen] = useState(
    () => initialQuery.length > 0 || hashParams.get('panel') !== null
  )
  const [query, setQuery] = useState(initialQuery)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  const [chip, setChip] = useState<{ x: number; y: number; quote: string } | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [saved, setSaved] = useState(false)
  const [panelMode, setPanelMode] = useState<'toc' | 'notes' | 'bookmarks'>(() => {
    const panel = hashParams.get('panel')
    return panel === 'notes' || panel === 'bookmarks' ? panel : 'toc'
  })

  /* ---------- 自动翻页 ---------- */
  const [autoOpen, setAutoOpen] = useState(() => hashParams.has('auto'))
  const [autoOn, setAutoOn] = useState(() => hashParams.get('auto') === 'on')
  const [autoSec, setAutoSec] = useState(() => Number(hashParams.get('sec')) || 12)
  const [speedInfo, setSpeedInfo] = useState<number | null>(null)
  const turnsRef = useRef<number[]>([])
  const autoDrivingRef = useRef(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pageTexts = useRef(new Map<number, string>())
  const highlightRef = useRef('')
  const pageRef = useRef(page)
  pageRef.current = page
  useReadingClock(book, () => 0)
  const notes = useMarks((state) => state.notes)
  const bookmarks = useMarks((state) => state.bookmarks)
  const addBookmark = useMarks((state) => state.addBookmark)
  const removeBookmark = useMarks((state) => state.removeBookmark)
  const removeNote = useMarks((state) => state.removeNote)

  const spreadActive = spread && width >= 980 && pages > 1
  const step = spreadActive ? 2 : 1
  const visiblePages = spreadActive
    ? [page, page + 1].filter((value) => value <= pages)
    : [page]
  /* 与文字阅读的纸张留白保持一致：左右各留出同样的空白 */
  const PAGE_PAD = 176
  const perPageWidth = spreadActive ? (width - 240) / 2 : Math.max(320, width - PAGE_PAD * 2)


  /* 翻页计时：自动翻页本身不参与统计 */
  useEffect(() => {
    if (autoDrivingRef.current) {
      autoDrivingRef.current = false
      return
    }
    turnsRef.current = [...turnsRef.current.slice(-11), Date.now()]
  }, [page])

  const computeSpeed = (): void => {
    const times = turnsRef.current
    if (times.length < 3) {
      setSpeedInfo(null)
      return
    }
    let sum = 0
    for (let i = 1; i < times.length; i += 1) sum += times[i] - times[i - 1]
    const avg = sum / (times.length - 1) / 1000
    if (avg > 1 && avg < 120) {
      const value = Math.round(avg * 1.1 * 10) / 10
      setSpeedInfo(value)
      setAutoSec(value)
    } else {
      setSpeedInfo(null)
    }
  }

  useEffect(() => {
    if (!autoOn || pages <= 0) return
    const timer = window.setInterval(() => {
      const current = pageRef.current
      if (current >= pages) {
        setAutoOn(false)
        return
      }
      autoDrivingRef.current = true
      setPage(current + 1)
    }, Math.max(2, autoSec) * 1000)
    return () => window.clearInterval(timer)
  }, [autoOn, autoSec, pages])

  /* 深链参数：spread=0/1 控制对开，便于测试与分享 */
  useEffect(() => {
    const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
    const value = params.get('spread')
    if (value === null) return
    useReader.getState().updateSettings({ spread: value !== '0' })
  }, [])

  /* 书签笔记 */
  useEffect(() => {
    void useMarks.getState().load(book.id)
  }, [book.id])

  /* 载入文档 */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`wuya-pdf://book/${book.id}`)
        if (!response.ok) throw new Error('无法读取 PDF 文件')
        const data = await response.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise
        if (cancelled) return
        setDoc(pdf)
        setPages(pdf.numPages)
        if (pdf.numPages !== book.pageCount) {
          void window.wuya?.library.setPageCount(book.id, pdf.numPages)
        }

        /* 没有封面时，用首页生成一张缩略封面 */
        if (!book.coverImage) {
          void (async () => {
            try {
              const first = await pdf.getPage(1)
              const base = first.getViewport({ scale: 1 })
              const view = first.getViewport({ scale: Math.min(1.6, 420 / base.width) })
              const thumb = document.createElement('canvas')
              thumb.width = Math.floor(view.width)
              thumb.height = Math.floor(view.height)
              const context = thumb.getContext('2d')
              if (!context) return
              await first.render({ canvasContext: context, viewport: view }).promise
              const dataUrl = thumb.toDataURL('image/jpeg', 0.82)
              await window.wuya?.library.saveCover(book.id, dataUrl)
              void useLibrary.getState().load()
            } catch {
              /* 封面失败不影响阅读 */
            }
          })()
        }

        const raw = await pdf.getOutline()
        if (raw && !cancelled) {
          const items: OutlineItem[] = []
          const walk = async (nodes: typeof raw, depth: number): Promise<void> => {
            for (const node of nodes) {
              let target = 0
              try {
                let dest = node.dest
                if (typeof dest === 'string') dest = await pdf.getDestination(dest)
                if (Array.isArray(dest) && dest[0]) target = await pdf.getPageIndex(dest[0])
              } catch {
                target = 0
              }
              items.push({ title: node.title, page: target + 1, depth })
              if (node.items?.length) await walk(node.items, depth + 1)
            }
          }
          await walk(raw, 0)
          if (!cancelled) setOutline(items)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [book.id, book.pageCount])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onResize = (): void => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* 进度 */
  useEffect(() => {
    if (!pages) return
    const timer = window.setTimeout(() => {
      void window.wuya?.reader.saveProgress(book.id, {
        chapterId: `p${page}`,
        percent: (page / pages) * 100,
        anchor: { block: page - 1, offset: 0 }
      })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [page, pages, book.id])

  const exitToShelf = useCallback((): void => {
    exit()
    void useLibrary.getState().load()
  }, [exit])

  const zoom = useCallback((delta: number): void => {
    setScale((current) => {
      const base = current > 0 ? current : 1
      return Math.min(3, Math.max(0.4, base + delta))
    })
  }, [])

  const runSearch = useCallback(
    async (term: string): Promise<void> => {
      const keyword = term.trim()
      if (!doc || !keyword) {
        setHits([])
        return
      }
      setSearching(true)
      const needle = keyword.toLowerCase()
      const found: SearchHit[] = []
      for (let index = 1; index <= doc.numPages && found.length < 80; index += 1) {
        let text = pageTexts.current.get(index)
        if (text === undefined) {
          const pageObj = await doc.getPage(index)
          const content = await pageObj.getTextContent()
          text = content.items
            .map((item) => ('str' in item ? item.str : ''))
            .join('')
            .replace(/\s+/g, ' ')
          pageTexts.current.set(index, text)
        }
        const lower = text.toLowerCase()
        let from = 0
        while (found.length < 80) {
          const at = lower.indexOf(needle, from)
          if (at < 0) break
          found.push({
            page: index,
            before: text.slice(Math.max(0, at - 18), at),
            match: text.slice(at, at + keyword.length),
            after: text.slice(at + keyword.length, at + keyword.length + 22)
          })
          from = at + Math.max(1, keyword.length)
        }
      }
      setHits(found)
      setSearched(true)
      setSearching(false)
    },
    [doc]
  )

  useEffect(() => {
    if (doc && initialQuery) void runSearch(initialQuery)
  }, [doc, initialQuery, runSearch])

  useEffect(() => {
    if (!tocOpen) return
    const timer = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(timer)
  }, [tocOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (autoOn) {
          setAutoOn(false)
          return
        }
        if (noteOpen) {
          setNoteOpen(false)
          return
        }
        if (tocOpen) setTocOpen(false)
        else exitToShelf()
        return
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault()
        setTocOpen(true)
        return
      }
      if (document.activeElement instanceof HTMLInputElement) return
      if (document.activeElement instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        setPage((current) => Math.min(pages || 1, current + step))
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        setPage((current) => Math.max(1, current - step))
      } else if (event.key === '+' || event.key === '=') {
        zoom(0.2)
      } else if (event.key === '-') {
        zoom(-0.2)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pages, tocOpen, noteOpen, exitToShelf, zoom, step])

  const pageOfBookmark = (chapterId: string): number => {
    const value = Number(chapterId.replace(/[^0-9]/g, ''))
    return Number.isFinite(value) && value > 0 ? value : 1
  }

  const bookmarked = bookmarks.some((item) => pageOfBookmark(item.chapterId) === page)

  const bookmarkPage = async (): Promise<void> => {
    if (!doc) return
    let text = pageTexts.current.get(page)
    if (text === undefined) {
      const pageObj = await doc.getPage(page)
      const content = await pageObj.getTextContent()
      text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      pageTexts.current.set(page, text)
    }
    await addBookmark({
      chapterId: `p${page}`,
      chapterTitle: `第 ${page} 页`,
      anchor: { block: page - 1, offset: 0 },
      excerpt: text.slice(0, 46)
    })
  }

  const jumpTo = (target: number, term?: string): void => {
    highlightRef.current = term ?? ''
    setPage(Math.min(pages, Math.max(1, target)))
    if (!term) return
    for (const layer of document.querySelectorAll('.textLayer')) {
      for (const span of layer.querySelectorAll('span')) {
        span.classList.toggle(
          'pdf-hit',
          (span.textContent ?? '').toLowerCase().includes(term.toLowerCase())
        )
      }
    }
  }

  /* 选中文字 → 记笔记 */
  const onStageMouseUp = (): void => {
    const selection = window.getSelection()
    const text = selection && !selection.isCollapsed ? selection.toString().trim() : ''
    if (!text || !selection) {
      setChip(null)
      return
    }
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setChip({
      x: rect.left + rect.width / 2,
      y: Math.max(60, rect.top - 8),
      quote: text.slice(0, 500)
    })
  }

  const saveNote = async (): Promise<void> => {
    if (!chip || !noteText.trim()) return
    await useMarks.getState().addNote({
      chapterId: `p${page}`,
      chapterTitle: `第 ${page} 页`,
      anchor: { block: page - 1, offset: 0 },
      quote: chip.quote,
      text: noteText.trim()
    })
    setNoteOpen(false)
    setNoteText('')
    setChip(null)
    window.getSelection()?.removeAllRanges()
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  const dark = theme === 'night' || theme === 'black'
  const percent = pages > 0 ? (page / pages) * 100 : 0
  const pageLabel = spreadActive && page < pages ? `${page}–${page + 1}` : `${page}`

  return (
    <div className="rd-root pdf-root" data-theme={theme}>
      <header className="rd-tb">
        <div className="rd-tb-l">
          <button className="iconbtn" type="button" title="返回书架" onClick={exitToShelf}>
            <Icon id="i-left" />
          </button>
          <span className="rd-book">{book.title}</span>
          <span className="rd-sep">/</span>
          <span className="rd-vol">PDF · {pages || '…'} 页</span>
        </div>
        <div className="rd-tb-r">
          <div className="pdf-zoom">
            <button type="button" onClick={() => zoom(-0.2)}>
              −
            </button>
            <span>{scale > 0 ? `${Math.round(scale * 100)}%` : '适合宽度'}</span>
            <button type="button" onClick={() => zoom(0.2)}>
              +
            </button>
            <button type="button" onClick={() => setScale(0)}>
              重置
            </button>
          </div>
          <WindowButtons />
        </div>
      </header>

      <div className="pdf-stage" ref={stageRef} onMouseUp={onStageMouseUp}>
        {error ? (
          <div className="rd-loading">{error}</div>
        ) : doc ? (
          <div className={`pdf-pages ${spreadActive ? 'spread' : ''}`}>
            {visiblePages.map((value) => (
              <PdfPageView
                key={value}
                doc={doc}
                pageNumber={value}
                maxWidth={perPageWidth}
                zoom={scale}
                dark={dark}
                highlight={highlightRef.current}
              />
            ))}
          </div>
        ) : (
          <div className="rd-loading">正在载入 PDF…</div>
        )}
      </div>

      <div className="rd-rail">
        <button
          className={`rail-i ${tocOpen && panelMode === 'toc' ? 'on' : ''}`}
          type="button"
          onClick={() => {
            setPanelMode('toc')
            setTocOpen(true)
          }}
        >
          <Icon id="i-toc" />
          <span>目录</span>
        </button>
        <button
          className={`rail-i ${tocOpen && panelMode === 'bookmarks' ? 'on' : ''}`}
          type="button"
          title="书签"
          onClick={() => {
            setPanelMode('bookmarks')
            setTocOpen(true)
          }}
        >
          <Icon id="i-bm" />
          <span>书签</span>
        </button>
        <button
          className={`rail-i ${tocOpen && panelMode === 'notes' ? 'on' : ''}`}
          type="button"
          title="笔记"
          onClick={() => {
            setPanelMode('notes')
            setTocOpen(true)
          }}
        >
          <Icon id="i-note" />
          <span>笔记</span>
        </button>
        <button
          className="rail-i"
          type="button"
          title="搜索（Ctrl+F）"
          onClick={() => {
            setPanelMode('toc')
            setTocOpen(true)
            setTimeout(() => inputRef.current?.focus(), 60)
          }}
        >
          <Icon id="i-search" />
          <span>搜索</span>
        </button>
        <button
          className={`rail-i ${autoOpen ? 'on' : ''}`}
          type="button"
          title="自动翻页"
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

      {autoOpen ? (
        <div className="rd-auto">
          <div className="ra-head">
            <span>自动翻页</span>
            <button className="ra-x" type="button" onClick={() => setAutoOpen(false)}>
              <Icon id="i-x" size={12} />
            </button>
          </div>
          <div className="ra-speed">
            <span>速度</span>
            <button
              className="ra-step"
              type="button"
              onClick={() => setAutoSec((value) => Math.max(2, Math.round((value - 1) * 10) / 10))}
            >
              −
            </button>
            <b>{autoSec} 秒/页</b>
            <button
              className="ra-step"
              type="button"
              onClick={() => setAutoSec((value) => Math.min(90, Math.round((value + 1) * 10) / 10))}
            >
              +
            </button>
          </div>
          <button className="ra-rec" type="button" onClick={computeSpeed}>
            用我的阅读速度
            {speedInfo ? `（${speedInfo} 秒/页）` : '（先翻几页再试）'}
          </button>
          <p className="ra-tip">按你最近的手动翻页估算，自动速度比实测慢 10%。</p>
          <button
            className={`ra-start ${autoOn ? 'on' : ''}`}
            type="button"
            onClick={() => setAutoOn((value) => !value)}
          >
            <Icon id={autoOn ? 'i-pause' : 'i-play'} size={13} />
            {autoOn ? '暂停' : '开始自动翻页'}
          </button>
        </div>
      ) : null}

      {autoOn ? (
        <button className="rd-auto-pill" type="button" onClick={() => setAutoOn(false)}>
          {`自动翻页中 · ${autoSec} 秒/页`}
          <span>点击停止</span>
        </button>
      ) : null}

      {tocOpen ? (
        <aside className="pdf-toc">
          <div className="pdf-toc-head">
            <div className="pdf-search">
              <Icon id="i-search" size={13} />
              <input
                ref={inputRef}
                value={query}
                placeholder="在 PDF 中搜索（回车）"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void runSearch(query)
                }}
              />
            </div>
          </div>
          <div className="pdf-toc-body">
            {panelMode === 'bookmarks' ? (
              <>
                <div className="pdf-bookmark-add">
                  <button
                    className="ra-start"
                    type="button"
                    disabled={!doc || bookmarked}
                    onClick={() => void bookmarkPage()}
                  >
                    <Icon id="i-bm" size={13} />
                    {bookmarked ? `第 ${page} 页已收藏` : `收藏当前页 · 第 ${page} 页`}
                  </button>
                </div>
                {bookmarks.length === 0 ? (
                  <div className="toc-empty">还没有书签。翻到想记住的一页，点上面的按钮。</div>
                ) : (
                  bookmarks.map((item) => (
                    <div key={item.id} className="mark">
                      <button
                        className="mark-main"
                        type="button"
                        onClick={() => jumpTo(pageOfBookmark(item.chapterId))}
                      >
                        <span className="mark-ch">
                          {item.chapterTitle}
                          <span className="mark-time">
                            {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                          </span>
                        </span>
                        {item.excerpt ? <span className="mark-quote">{item.excerpt}</span> : null}
                      </button>
                      <button
                        className="mark-del"
                        type="button"
                        title="删除书签"
                        onClick={() => void removeBookmark(item.id)}
                      >
                        <Icon id="i-x" size={12} />
                      </button>
                    </div>
                  ))
                )}
              </>
            ) : panelMode === 'notes' ? (
              notes.length === 0 ? (
                <div className="toc-empty">还没有笔记。选中正文后点「记笔记」。</div>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="mark">
                    <button
                      className="mark-main"
                      type="button"
                      onClick={() => jumpTo((note.anchor.block ?? 0) + 1)}
                    >
                      <span className="mark-ch">第 {(note.anchor.block ?? 0) + 1} 页</span>
                      {note.quote ? <span className="mark-quote">{note.quote}</span> : null}
                      <span className="mark-text">{note.text}</span>
                    </button>
                    <button
                      className="mark-del"
                      type="button"
                      title="删除笔记"
                      onClick={() => void removeNote(note.id)}
                    >
                      <Icon id="i-x" size={12} />
                    </button>
                  </div>
                ))
              )
            ) : query.trim() ? (
              searching ? (
                <div className="toc-empty">搜索中…</div>
              ) : !searched ? null : hits.length === 0 ? (
                <div className="toc-empty">
                  没有找到「{query.trim()}」。扫描版 PDF 没有文字层，搜不到。
                </div>
              ) : (
                <>
                  <div className="toc-empty">找到 {hits.length} 处</div>
                  {hits.map((hit, index) => (
                    <button
                      key={`${hit.page}-${index}`}
                      className="pdf-hit-row"
                      type="button"
                      onClick={() => jumpTo(hit.page, query.trim())}
                    >
                      <span className="pdf-hit-page">第 {hit.page} 页</span>
                      <span className="pdf-hit-text">
                        {hit.before}
                        <mark>{hit.match}</mark>
                        {hit.after}
                      </span>
                    </button>
                  ))}
                </>
              )
            ) : outline.length === 0 ? (
              <div className="toc-empty">这份 PDF 没有书签目录，可以用页码、方向键或搜索定位。</div>
            ) : (
              <>
                <div className="toc-empty">目录 · {outline.length} 条</div>
                {outline.map((item, index) => (
                  <button
                    key={`${item.title}-${index}`}
                    className="pdf-toc-item"
                    type="button"
                    style={{ paddingLeft: `${14 + item.depth * 14}px` }}
                    onClick={() => jumpTo(item.page)}
                  >
                    <span className="pdf-toc-title">{item.title}</span>
                    <span className="pdf-toc-page">{item.page}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </aside>
      ) : null}

      {chip && !noteOpen ? (
        <button
          className="pdf-chip"
          type="button"
          style={{ left: chip.x, top: chip.y }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setNoteOpen(true)
            setNoteText('')
          }}
        >
          记笔记
        </button>
      ) : null}

      {noteOpen && chip ? (
        <div className="pdf-note-mask" onClick={() => setNoteOpen(false)}>
          <div className="pdf-note" onClick={(event) => event.stopPropagation()}>
            <div className="pdf-note-head">摘录到笔记 · 第 {page} 页</div>
            <div className="note-quote">{chip.quote}</div>
            <textarea
              autoFocus
              value={noteText}
              placeholder="写下你的想法…"
              onChange={(event) => setNoteText(event.target.value)}
            />
            <div className="note-actions">
              <button className="btn-ghost" type="button" onClick={() => setNoteOpen(false)}>
                取消
              </button>
              <button
                className="btn-solid"
                type="button"
                disabled={!noteText.trim()}
                onClick={() => void saveNote()}
              >
                保存笔记
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saved ? <div className="pdf-saved">已存入笔记，可在「笔记」面板查看</div> : null}

      <footer className="rd-foot">
        <div className="rd-g" style={{ width: `${percent}%` }} />
        <span>
          第 {pageLabel} 页 / 共 {pages || '…'} 页
        </span>
        <span>{Math.round(percent)}%</span>
      </footer>
    </div>
  )
}
