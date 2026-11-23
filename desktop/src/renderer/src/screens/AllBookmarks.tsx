import { useEffect, useState } from 'react'
import type { Bookmark } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { WindowButtons } from '../components/WindowButtons'
import { useLibrary } from '../stores/library'
import { useReader } from '../stores/reader'

interface BookGroup {
  bookId: string
  title: string
  author: string
  format: string
  bookmarks: Bookmark[]
}

export function AllBookmarks(): React.JSX.Element | null {
  const open = useLibrary((state) => state.bookmarksOpen)
  const setOpen = useLibrary((state) => state.setBookmarksOpen)
  const books = useLibrary((state) => state.books)
  const [groups, setGroups] = useState<BookGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void (async () => {
      const list = (await window.wuya?.marks.all()) ?? []
      setGroups(list.filter((group) => group.bookmarks.length > 0))
      setLoading(false)
    })()
  }, [open])

  if (!open) return null

  const total = groups.reduce((sum, group) => sum + group.bookmarks.length, 0)

  const jumpTo = async (bookId: string, bookmark: Bookmark): Promise<void> => {
    const book = books.find((item) => item.id === bookId)
    if (!book) return
    await window.wuya?.reader.saveProgress(bookId, {
      chapterId: bookmark.chapterId,
      percent: book.progress,
      anchor: bookmark.anchor
    })
    await useLibrary.getState().load()
    const updated = useLibrary.getState().books.find((item) => item.id === bookId) ?? book
    setOpen(false)
    await useReader.getState().start(updated)
  }

  const remove = async (bookId: string, markId: string): Promise<void> => {
    const marks = await window.wuya?.marks.removeBookmark(bookId, markId)
    setGroups((value) =>
      value
        .map((group) =>
          group.bookId === bookId
            ? { ...group, bookmarks: marks?.bookmarks ?? group.bookmarks }
            : group
        )
        .filter((group) => group.bookmarks.length > 0)
    )
  }

  return (
    <div className="ab-root">
      <header className="ab-tb">
        <div className="ab-tb-l">
          <button className="iconbtn" type="button" title="返回书架" onClick={() => setOpen(false)}>
            <Icon id="i-left" />
          </button>
          <span className="ab-title">全部书签</span>
          <span className="ab-sub">
            {loading ? '读取中…' : `${total} 条 · ${groups.length} 本`}
          </span>
        </div>
        <WindowButtons />
      </header>

      <div className="ab-body">
        {!loading && groups.length === 0 ? (
          <div className="ab-empty">
            还没有书签。读到想记住的地方，在阅读器右侧点「书签」。
          </div>
        ) : null}

        {groups.map((group) => (
          <section className="ab-group" key={group.bookId}>
            <div className="ab-book">
              <span className="ab-book-title">{group.title}</span>
              <span className="ab-book-meta">
                {group.author} · {group.format} · {group.bookmarks.length} 条
              </span>
            </div>
            {group.bookmarks.map((bookmark) => (
              <div className="mark" key={bookmark.id}>
                <button
                  className="mark-main"
                  type="button"
                  onClick={() => void jumpTo(group.bookId, bookmark)}
                >
                  <span className="mark-ch">
                    {bookmark.chapterTitle}
                    <span className="mark-time">
                      {new Date(bookmark.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </span>
                  {bookmark.excerpt ? <span className="mark-quote">{bookmark.excerpt}</span> : null}
                </button>
                <button
                  className="mark-del"
                  type="button"
                  title="删除书签"
                  onClick={() => void remove(group.bookId, bookmark.id)}
                >
                  <Icon id="i-x" size={12} />
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
