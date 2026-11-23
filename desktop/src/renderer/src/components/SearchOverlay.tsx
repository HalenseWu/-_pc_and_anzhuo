import { useEffect } from 'react'
import type { SearchHit } from '../../../shared/types'
import { Icon } from './Icon'
import { useLibrary } from '../stores/library'
import { useReader } from '../stores/reader'

export function SearchOverlay(): React.JSX.Element | null {
  const open = useLibrary((state) => state.searchOpen)
  const query = useLibrary((state) => state.searchQuery)
  const groups = useLibrary((state) => state.searchGroups)
  const searching = useLibrary((state) => state.searching)
  const close = useLibrary((state) => state.closeSearch)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  const total = groups.reduce((sum, group) => sum + group.hits.length, 0)

  const openHit = async (bookId: string, hit: SearchHit): Promise<void> => {
    const book = useLibrary.getState().books.find((item) => item.id === bookId)
    if (!book) return
    close()
    await useReader.getState().start(book)
    await useReader.getState().goToOffset(hit.chapterId, hit.offsetInChapter, hit.matchLength)
  }

  return (
    <div className="search-mask" onClick={close}>
      <div className="search-panel" onClick={(event) => event.stopPropagation()}>
        <div className="search-head">
          <div className="search-title">
            全库搜索「{query}」
            <span>{searching ? '搜索中…' : `共 ${total} 处 · ${groups.length} 本`}</span>
          </div>
          <button className="search-close" type="button" onClick={close}>
            <Icon id="i-x" size={14} />
          </button>
        </div>
        <div className="search-body">
          {searching && groups.length === 0 ? <div className="search-empty">正在翻书…</div> : null}
          {!searching && groups.length === 0 ? (
            <div className="search-empty">没有找到「{query}」。</div>
          ) : null}
          {groups.map((group) => (
            <div className="search-group" key={group.bookId}>
              <div className="search-book">
                <span className="search-book-title">{group.title}</span>
                <span className="search-book-meta">
                  {group.author} · {group.format}
                </span>
              </div>
              {group.hits.map((hit, index) => (
                <button
                  className="hit"
                  key={`${hit.chapterId}-${hit.offsetInChapter}-${index}`}
                  type="button"
                  onClick={() => void openHit(group.bookId, hit)}
                >
                  <span className="hit-ch">{hit.chapterTitle}</span>
                  <span className="hit-text">
                    {hit.excerpt.slice(0, hit.matchStart)}
                    <mark>{hit.excerpt.slice(hit.matchStart, hit.matchStart + hit.matchLength)}</mark>
                    {hit.excerpt.slice(hit.matchStart + hit.matchLength)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
