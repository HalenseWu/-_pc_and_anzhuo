import { useEffect, useState } from 'react'
import type { Bookmark, Note } from '../store/marks'
import type { SearchHit } from '../store/library'

type Tab = 'toc' | 'marks' | 'notes' | 'search'

interface Chapter {
  id: string
  title: string
  chars: number
}

interface Props {
  open: boolean
  chapters: Chapter[]
  currentId: string | null
  marks: Bookmark[]
  notes: Note[]
  onClose: () => void
  onPick: (index: number) => void
  onPickMark: (mark: Bookmark) => void
  onDeleteMark: (id: string) => void
  onPickNote: (note: Note) => void
  onDeleteNote: (id: string) => void
  onAddNote: () => void
  initialTab?: Tab
  onSearch: (query: string) => Promise<SearchHit[]>
  onPickHit: (hit: SearchHit) => void
}

export function TocDrawer({
  open,
  chapters,
  currentId,
  marks,
  notes,
  onClose,
  onPick,
  onPickMark,
  onDeleteMark,
  onPickNote,
  onDeleteNote,
  onAddNote,
  initialTab = 'toc',
  onSearch,
  onPickHit
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('toc')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)

  /* 每次打开都回到目录页 */
  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    if (tab !== 'search') return
    const keyword = query.trim()
    if (keyword.length === 0) {
      setHits([])
      return
    }
    let alive = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      void onSearch(keyword).then((list) => {
        if (!alive) return
        setHits(list)
        setSearching(false)
      })
    }, 260)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query, tab, onSearch])

  return (
    <div className={`drawer ${open ? 'open' : ''}`}>
      <div className="drawer-head">
        <button className="ghost" type="button" onClick={onClose}>
          ←
        </button>
        <div className="drawer-tabs">
          {(
            [
              ['toc', '目录'],
              ['marks', `书签${marks.length ? ` ${marks.length}` : ''}`],
              ['notes', `笔记${notes.length ? ` ${notes.length}` : ''}`],
              ['search', '搜索']
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'search' ? (
        <div className="drawer-search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索本章之后的所有章节"
            autoFocus
          />
          {searching ? <span className="search-state">搜索中…</span> : null}
        </div>
      ) : null}

      <div className="drawer-list">
        {tab === 'toc'
          ? chapters.map((chapter, index) => (
              <button
                key={chapter.id}
                type="button"
                className={`toc-item ${chapter.id === currentId ? 'on' : ''}`}
                onClick={() => {
                  onPick(index)
                  onClose()
                }}
              >
                <span className="toc-title">{chapter.title}</span>
                <span className="toc-meta">
                  {chapter.chars > 0 ? `${Math.round(chapter.chars / 1000)} 千字` : ''}
                </span>
              </button>
            ))
          : null}

        {tab === 'marks'
          ? marks.map((mark) => (
              <div key={mark.id} className="mark-item">
                <button
                  type="button"
                  className="mark-main"
                  onClick={() => {
                    onPickMark(mark)
                    onClose()
                  }}
                >
                  <span className="mark-chapter">{mark.chapterTitle}</span>
                  <span className="mark-text">{mark.text || `第 ${mark.block + 1} 段`}</span>
                </button>
                <button type="button" className="mark-del" onClick={() => onDeleteMark(mark.id)}>
                  ×
                </button>
              </div>
            ))
          : null}

        {tab === 'notes'
          ? notes.map((note) => (
              <div key={note.id} className="mark-item">
                <button
                  type="button"
                  className="mark-main"
                  onClick={() => {
                    onPickNote(note)
                    onClose()
                  }}
                >
                  <span className="mark-chapter">{note.chapterTitle}</span>
                  <span className="note-body">{note.body}</span>
                  {note.quote ? <span className="note-quote">“{note.quote}”</span> : null}
                </button>
                <button type="button" className="mark-del" onClick={() => onDeleteNote(note.id)}>
                  ×
                </button>
              </div>
            ))
          : null}

        {tab === 'search'
          ? hits.map((hit, index) => (
              <button
                key={`${hit.chapterId}-${index}`}
                type="button"
                className="search-item"
                onClick={() => {
                  onPickHit(hit)
                  onClose()
                }}
              >
                <span className="mark-chapter">{hit.chapterTitle}</span>
                <span className="mark-text">{hit.snippet}</span>
              </button>
            ))
          : null}

        {tab === 'marks' && marks.length === 0 ? (
          <div className="drawer-empty">还没有书签，阅读时点右上角「书签」即可添加</div>
        ) : null}
        {tab === 'notes' && notes.length === 0 ? (
          <div className="drawer-empty">还没有笔记，阅读时点「写笔记」记录想法</div>
        ) : null}
        {tab === 'search' && query.trim() && !searching && hits.length === 0 ? (
          <div className="drawer-empty">没有找到「{query.trim()}」</div>
        ) : null}
      </div>

      {tab === 'notes' ? (
        <button type="button" className="drawer-fab" onClick={onAddNote}>
          写笔记
        </button>
      ) : null}
    </div>
  )
}
