import { useEffect, useMemo, useRef, useState } from 'react'
import type { SearchHit } from '../../../../shared/types'
import { Icon } from '../Icon'
import { useMarks } from '../../stores/marks'
import { useReader } from '../../stores/reader'
import { useEditor } from '../../stores/editor'

interface TocDrawerProps {
  open: boolean
  onClose: () => void
  tab: Tab
  onTabChange: (tab: Tab) => void
}

export type Tab = 'toc' | 'bookmarks' | 'notes'

const TAB_LABEL: Record<Tab, string> = { toc: '目录', bookmarks: '书签', notes: '笔记' }

function timeText(value: number): string {
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function TocDrawer({ open, onClose, tab, onTabChange }: TocDrawerProps): React.JSX.Element {
  const toc = useReader((state) => state.toc)
  const chapters = useReader((state) => state.chapters)
  const chapter = useReader((state) => state.chapter)
  const loadChapter = useReader((state) => state.loadChapter)
  const book = useReader((state) => state.book)
  const currentAnchor = useReader((state) => state.currentAnchor)

  const bookmarks = useMarks((state) => state.bookmarks)
  const notes = useMarks((state) => state.notes)
  const addBookmark = useMarks((state) => state.addBookmark)
  const removeBookmark = useMarks((state) => state.removeBookmark)
  const removeNote = useMarks((state) => state.removeNote)
  const addNote = useMarks((state) => state.addNote)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('q') ?? '')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [composing, setComposing] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [draftQuote, setDraftQuote] = useState('')
  const activeRef = useRef<HTMLElement>(null)

  const currentVolume = useMemo(() => {
    if (!chapter) return null
    const vol = toc.find((node) => node.children?.some((child) => child.id === chapter.id))
    return vol?.id ?? null
  }, [toc, chapter])

  useEffect(() => {
    const next = new Set<string>()
    for (const node of toc) {
      if (node.children?.length && node.id !== currentVolume) next.add(node.id)
    }
    setCollapsed(next)
  }, [toc, currentVolume])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(
      () => activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      60
    )
    return () => clearTimeout(timer)
  }, [open, chapter, tab])

  useEffect(() => {
    if (!open) return
    const target = query.trim()
    if (!target || !book) {
      setHits([])
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      void window.wuya?.search.book(book.id, target).then((result) => {
        setHits(result)
        setSearching(false)
      })
    }, 220)
    return () => clearTimeout(timer)
  }, [query, open, book])

  const toggle = (id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const jumpChapter = (id: string): void => {
    void loadChapter(id)
    onClose()
  }

  const jumpMark = (chapterId: string, anchor: { block: number; offset: number }): void => {
    void useReader.getState().loadChapter(chapterId, anchor)
    onClose()
  }

  const jumpHit = (hit: SearchHit): void => {
    void useReader.getState().goToOffset(hit.chapterId, hit.offsetInChapter, hit.matchLength)
    onClose()
  }

  const chapterNumber = (id: string): number => chapters.findIndex((item) => item.id === id) + 1

  const addCurrentBookmark = (): void => {
    if (!chapter || !currentAnchor) return
    const excerpt = chapter.paragraphs[currentAnchor.anchor.block] ?? chapter.title
    void addBookmark({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      anchor: currentAnchor.anchor,
      excerpt
    })
  }

  const renderToc = (): React.ReactNode =>
    toc.map((node) =>
      node.children?.length ? (
        <div key={node.id}>
          <button className="vol" type="button" onClick={() => toggle(node.id)}>
            <Icon id={collapsed.has(node.id) ? 'i-right' : 'i-down'} size={12} />
            {node.title}
            <span className="cnt">{node.children.length} 章</span>
          </button>
          {collapsed.has(node.id) ? null : (
            <div className="ch-grid">
              {node.children.map((child) => (
                <button
                  key={child.id}
                  ref={child.id === chapter?.id ? (activeRef as never) : undefined}
                  className={`ch ${child.id === chapter?.id ? 'cur' : ''}`}
                  type="button"
                  onClick={() => jumpChapter(child.id)}
                >
                  <span className="cnum">{String(chapterNumber(child.id)).padStart(3, '0')}</span>
                  {child.title}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          key={node.id}
          ref={node.id === chapter?.id ? (activeRef as never) : undefined}
          className={`ch ${node.id === chapter?.id ? 'cur' : ''}`}
          type="button"
          onClick={() => jumpChapter(node.id)}
        >
          <span className="cnum">{String(chapterNumber(node.id)).padStart(3, '0')}</span>
          {node.title}
        </button>
      )
    )

  const renderSearch = (): React.ReactNode => {
    if (!query.trim()) return null
    if (searching && hits.length === 0) return <div className="toc-empty">搜索中…</div>
    if (hits.length === 0) return <div className="toc-empty">没有找到「{query.trim()}」</div>
    return (
      <>
        <div className="toc-empty">找到 {hits.length} 处</div>
        {hits.map((hit, index) => (
          <button
            key={`${hit.chapterId}-${hit.offsetInChapter}-${index}`}
            className="hit"
            type="button"
            onClick={() => jumpHit(hit)}
          >
            <span className="hit-ch">{hit.chapterTitle}</span>
            <span className="hit-text">
              {hit.excerpt.slice(0, hit.matchStart)}
              <mark>{hit.excerpt.slice(hit.matchStart, hit.matchStart + hit.matchLength)}</mark>
              {hit.excerpt.slice(hit.matchStart + hit.matchLength)}
            </span>
          </button>
        ))}
      </>
    )
  }

  const renderBookmarks = (): React.ReactNode => (
    <>
      <button className="mark-add" type="button" disabled={!currentAnchor} onClick={addCurrentBookmark}>
        <Icon id="i-plus" size={12} />
        添加当前位置
      </button>
      {bookmarks.length === 0 ? (
        <div className="toc-empty">还没有书签。读到想记住的地方，点这里。</div>
      ) : (
        bookmarks.map((mark) => (
          <div key={mark.id} className="mark">
            <button
              className="mark-main"
              type="button"
              onClick={() => jumpMark(mark.chapterId, mark.anchor)}
            >
              <span className="mark-ch">
                {mark.chapterTitle}
                <span className="mark-time">{timeText(mark.createdAt)}</span>
              </span>
              <span className="mark-text">{mark.excerpt}</span>
            </button>
            <button
              className="mark-del"
              type="button"
              title="删除书签"
              onClick={() => void removeBookmark(mark.id)}
            >
              <Icon id="i-x" size={12} />
            </button>
          </div>
        ))
      )}
    </>
  )

  const renderNotes = (): React.ReactNode => (
    <>
      {composing ? (
        <div className="note-form">
          <div className="note-quote">{draftQuote}</div>
          <textarea
            autoFocus
            value={noteText}
            placeholder="写下你的想法…"
            onChange={(event) => setNoteText(event.target.value)}
          />
          <div className="note-actions">
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                setComposing(false)
                setNoteText('')
              }}
            >
              取消
            </button>
            <button
              className="btn-solid"
              type="button"
              disabled={!noteText.trim()}
              onClick={() => {
                if (!chapter || !currentAnchor) return
                const quote = draftQuote
                void addNote({
                  chapterId: chapter.id,
                  chapterTitle: chapter.title,
                  anchor: currentAnchor.anchor,
                  quote,
                  text: noteText.trim()
                })
                setComposing(false)
                setNoteText('')
              }}
            >
              保存笔记
            </button>
          </div>
        </div>
      ) : (
        <button
          className="mark-add"
          type="button"
          disabled={!currentAnchor}
          onClick={() => {
            const selection = window.getSelection()
            const selected = selection && !selection.isCollapsed ? selection.toString().trim() : ''
            const paragraph =
              chapter && currentAnchor ? (chapter.paragraphs[currentAnchor.anchor.block] ?? '') : ''
            setDraftQuote((selected || paragraph).slice(0, 200))
            setComposing(true)
          }}
        >
          <Icon id="i-plus" size={12} />
          写笔记
        </button>
      )}
      {notes.length === 0 ? (
        <div className="toc-empty">还没有笔记。边读边记，回头能翻。</div>
      ) : (
        notes.map((note) => (
          <div key={note.id} className="mark">
            <button
              className="mark-main"
              type="button"
              onClick={() => jumpMark(note.chapterId, note.anchor)}
            >
              <span className="mark-ch">
                {note.chapterTitle}
                <span className="mark-time">{timeText(note.createdAt)}</span>
              </span>
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
      )}
    </>
  )

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={`toc ${open ? 'open' : ''}`}>
        <div className="toc-head">
          <div className="toc-title-row">
            <h2>{query.trim() ? '搜索' : TAB_LABEL[tab]}</h2>
            <span>
              共 {toc.filter((node) => node.children?.length).length} 卷 · {chapters.length} 章
            </span>
            <button
              className="toc-edit"
              type="button"
              onClick={() => {
                const book = useReader.getState().book
                if (book) {
                  useEditor.getState().open(book)
                  onClose()
                }
              }}
            >
              校正
            </button>
            <button className="toc-close" type="button" onClick={onClose}>
              <Icon id="i-x" size={14} />
            </button>
          </div>
          <div className="toc-tabs">
            {(['toc', 'bookmarks', 'notes'] as Tab[]).map((item) => (
              <button
                key={item}
                className={`toc-tab ${tab === item && !query.trim() ? 'on' : ''}`}
                type="button"
                onClick={() => {
                  onTabChange(item)
                  setQuery('')
                }}
              >
                {TAB_LABEL[item]}
                {item === 'bookmarks' && bookmarks.length ? ` ${bookmarks.length}` : ''}
                {item === 'notes' && notes.length ? ` ${notes.length}` : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="toc-tools">
          <div className="toc-search">
            <Icon id="i-search" size={13} />
            <input
              value={query}
              placeholder="在本书中搜索"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button className="toc-search-clear" type="button" onClick={() => setQuery('')}>
                <Icon id="i-x" size={11} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="toc-list">
          {query.trim()
            ? renderSearch()
            : tab === 'toc'
              ? renderToc()
              : tab === 'bookmarks'
                ? renderBookmarks()
                : renderNotes()}
        </div>
      </aside>
    </>
  )
}
