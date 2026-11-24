import { useState } from 'react'
import { useLibrary } from '../stores/library'
import { useReader } from '../stores/reader'
import type { BookMeta } from '../../../shared/types'
import { Icon } from '../components/Icon'

function Cover({ book, onOpen }: { book: BookMeta; onOpen: (book: BookMeta) => void }): React.JSX.Element {
  const setOrganizing = useLibrary((state) => state.setOrganizing)
  return (
    <div className="cover" style={{ ['--c1' as string]: book.cover[0], ['--c2' as string]: book.cover[1] }}>
      {book.coverImage ? (
        <img className="cv-img" src={`wuya-media://book/${book.id}/${book.coverImage}`} alt="" />
      ) : (
        <>
          <div className="cv-frame" />
          <div className="cv-t">{book.title.length > 12 ? `${book.title.slice(0, 12)}…` : book.title}</div>
          <div className="cv-a">{book.author}</div>
          <div className="cv-s">涯</div>
        </>
      )}
      <div className="badge">{book.format}</div>
      <button
        className="cv-more"
        type="button"
        title="整理分组 / 标签"
        onClick={(event) => {
          event.stopPropagation()
          setOrganizing(book)
        }}
      >
        ⋯
      </button>
      <button
        className="hoverbtn"
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onOpen(book)
        }}
      >
        {book.progress > 0 ? '继续阅读' : '开始阅读'}
      </button>
    </div>
  )
}

function BookCard({
  book,
  onOpen,
  onMenu
}: {
  book: BookMeta
  onOpen: (book: BookMeta) => void
  onMenu: (book: BookMeta, x: number, y: number) => void
}): React.JSX.Element {
  return (
    <div
      className="card"
      title="双击打开 · 右键更多"
      onDoubleClick={() => onOpen(book)}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onMenu(book, event.clientX, event.clientY)
      }}
    >
      <Cover book={book} onOpen={onOpen} />
      <div className="c-title">{book.title}</div>
      <div className="c-meta">
        <span>{book.author}</span>
        <span>{book.progress > 0 ? `${book.progress}%` : book.format === 'PDF' ? `${book.pageCount || 0} 页` : `${book.chapterCount} 章`}</span>
      </div>
      <div className="c-bar">
        <i style={{ width: `${book.progress}%` }} />
      </div>
    </div>
  )
}

function EmptyShelf(): React.JSX.Element {
  const pickAndImport = useLibrary((state) => state.pickAndImport)
  return (
    <div className="empty">
      <div className="empty-seal">涯</div>
      <h2>书架还空着</h2>
      <p>把 TXT 拖进窗口，或者从这里选一本</p>
      <button className="btn-go" type="button" onClick={() => void pickAndImport()}>
        选择文件
        <Icon id="i-plus" size={12} />
      </button>
      <span className="empty-hint">支持 TXT / EPUB / PDF，自动识别编码、章节与分卷</span>
    </div>
  )
}

export function Shelf(): React.JSX.Element {
  const books = useLibrary((state) => state.books)
  const view = useLibrary((state) => state.view)
  const groupFilter = useLibrary((state) => state.groupFilter)
  const tagFilter = useLibrary((state) => state.tagFilter)
  const filter = useLibrary((state) => state.filter).trim()

  const byView =
    view === 'recent'
      ? books.filter((book) => book.lastReadAt)
      : view === 'reading'
        ? books.filter((book) => book.progress > 0 && book.progress < 100)
        : view === 'unread'
          ? books.filter((book) => book.progress === 0)
          : view === 'done'
            ? books.filter((book) => book.progress >= 100)
            : books
  const byGroup = groupFilter
    ? byView.filter((book) => (book.group?.trim() || '未分组') === groupFilter)
    : byView
  const byTag = tagFilter
    ? byGroup.filter((book) => (book.tags ?? []).includes(tagFilter))
    : byGroup
  const visible = filter
    ? byTag.filter((book) =>
        `${book.title}${book.author}`.toLowerCase().includes(filter.toLowerCase())
      )
    : byTag

  const loaded = useLibrary((state) => state.loaded)
  const removeBook = useLibrary((state) => state.remove)
  const renameBook = useLibrary((state) => state.renameBook)
  const reloadBook = useLibrary((state) => state.reloadBook)
  const [ctxMenu, setCtxMenu] = useState<{ book: BookMeta; x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<{ book: BookMeta; text: string } | null>(null)
  const [deleting, setDeleting] = useState<BookMeta | null>(null)
  const current = books[0]
  const onOpen = (book: BookMeta): void => {
    void useReader.getState().start(book)
  }

  return (
    <main className="main">
      <div className="main-head">
        <div>
          <h1>我的书架</h1>
          <p>
            {visible.length} 本{groupFilter ? ` · 分组「${groupFilter}」` : ''}{tagFilter ? ` · 标签「${tagFilter}」` : ''}
            {books.length > 0 ? ` · 共 ${books.reduce((sum, book) => sum + book.chapterCount, 0)} 章` : ''}
            {' · '}继续上次阅读
          </p>
        </div>
        <div className="head-actions">
          <button className="sortbtn" type="button">
            最近阅读
            <Icon id="i-down" size={12} />
          </button>
          <div className="viewtog">
            <button className="on" type="button" title="网格">
              <Icon id="i-grid" size={13} />
            </button>
            <button type="button" title="列表">
              <Icon id="i-list" size={13} />
            </button>
          </div>
        </div>
      </div>

      {loaded && books.length === 0 ? (
        <EmptyShelf />
      ) : (
        <>
          {current ? (
            <div className="hero">
              <div className="hc">
                {current.coverImage ? (
                  <img src={`wuya-media://book/${current.id}/${current.coverImage}`} alt="" />
                ) : (
                  <span className="hc-t">{current.title}</span>
                )}
              </div>
              <div className="hi">
                <div className="hl">继续阅读</div>
                <div className="ht">{current.title}</div>
                <div className="hm">
                  {current.format === 'PDF'
                    ? `${current.pageCount || 0} 页 · ${current.author} · PDF`
                    : `${current.chapterCount} 章 · ${current.author} · ${current.encoding}`}
                </div>
              </div>
              <div className="hp">
                <div className="track">
                  <i style={{ width: `${current.progress}%` }} />
                </div>
                <div className="pct">{current.progress}%</div>
                <button className="btn-go" type="button" onClick={() => onOpen(current)}>
                  继续
                  <Icon id="i-right" size={12} />
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid">
            {visible.map((book) => (
              <BookCard key={book.id} book={book} onOpen={onOpen} onMenu={(target, x, y) => setCtxMenu({ book: target, x, y })} />
            ))}
          </div>
          {visible.length === 0 && books.length > 0 ? (
            <div className="shelf-empty-filter">
              {filter ? `没有匹配「${filter}」的书` : '这个分类下还没有书'}
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  useLibrary.getState().setFilter('')
                  useLibrary.getState().setView('all')
                  useLibrary.getState().setGroupFilter(null)
                  useLibrary.getState().setTagFilter(null)
                }}
              >
                看全部
              </button>
            </div>
          ) : null}
        </>
      )}

      <div className="shelf-foot">
        <span>{filter ? `筛选「${filter}」：${visible.length} 本` : '阅读数据只存在本机'}</span>
        <span>拖入文件即可导入 · 支持 TXT / EPUB / PDF</span>
      </div>
      {ctxMenu ? (
        <div
          className="ctx-mask"
          onClick={() => setCtxMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault()
            setCtxMenu(null)
          }}
        >
          <div
            className="ctx-menu"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 190),
              top: Math.min(ctxMenu.y, window.innerHeight - 160)
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setRenaming({ book: ctxMenu.book, text: ctxMenu.book.title })
                setCtxMenu(null)
              }}
            >
              重命名
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleting(ctxMenu.book)
                setCtxMenu(null)
              }}
            >
              删除
            </button>
            <button
              type="button"
              onClick={() => {
                const target = ctxMenu.book
                setCtxMenu(null)
                void reloadBook(target.id)
              }}
            >
              重新载入
            </button>
          </div>
        </div>
      ) : null}

      {renaming ? (
        <div className="ctx-mask" onClick={() => setRenaming(null)}>
          <div className="mini-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>重命名</h3>
            <input
              autoFocus
              value={renaming.text}
              onChange={(event) => setRenaming({ ...renaming, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void renameBook(renaming.book.id, renaming.text)
                  setRenaming(null)
                }
                if (event.key === 'Escape') setRenaming(null)
              }}
            />
            <div className="mini-actions">
              <button type="button" className="ghost" onClick={() => setRenaming(null)}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  void renameBook(renaming.book.id, renaming.text)
                  setRenaming(null)
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleting ? (
        <div className="ctx-mask" onClick={() => setDeleting(null)}>
          <div className="mini-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>删除《{deleting.title}》？</h3>
            <p>只会删除阅读器里的副本，不会动你的原始文件。</p>
            <div className="mini-actions">
              <button type="button" className="ghost" onClick={() => setDeleting(null)}>
                取消
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void removeBook(deleting.id)
                  setDeleting(null)
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
