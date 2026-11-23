import { useMemo } from 'react'
import { Icon } from './Icon'
import { useLibrary } from '../stores/library'

const DOT_COLORS = ['#2E4A52', '#7A4A2B', '#6E2B2B', '#45625C', '#5A4B7A', '#7A5A2B']

export function Sidebar(): React.JSX.Element {
  const books = useLibrary((state) => state.books)
  const view = useLibrary((state) => state.view)
  const setView = useLibrary((state) => state.setView)
  const groupFilter = useLibrary((state) => state.groupFilter)
  const setGroupFilter = useLibrary((state) => state.setGroupFilter)
  const tagFilter = useLibrary((state) => state.tagFilter)
  const setTagFilter = useLibrary((state) => state.setTagFilter)
  const setSettingsOpen = useLibrary((state) => state.setSettingsOpen)
  const setStatsOpen = useLibrary((state) => state.setStatsOpen)
  const setBookmarksOpen = useLibrary((state) => state.setBookmarksOpen)

  const total = books.length
  const recent = books.filter((book) => book.lastReadAt).length
  const reading = books.filter((book) => book.progress > 0 && book.progress < 100).length
  const finished = books.filter((book) => book.progress >= 100).length

  const groups = useMemo(() => {
    const map = new Map<string, number>()
    for (const book of books) {
      const name = book.group?.trim() || '未分组'
      map.set(name, (map.get(name) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === '未分组') return 1
      if (b[0] === '未分组') return -1
      return b[1] - a[1]
    })
  }, [books])

  const tags = useMemo(() => {
    const map = new Map<string, number>()
    for (const book of books) {
      for (const tag of book.tags ?? []) map.set(tag, (map.get(tag) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [books])

  const item = (
    id: 'all' | 'recent' | 'reading' | 'unread' | 'done',
    label: string,
    icon: string,
    count: number
  ): React.JSX.Element => (
    <button
      className={`nav-item ${view === id && !groupFilter && !tagFilter ? 'active' : ''}`}
      type="button"
      onClick={() => {
        setView(id)
        setGroupFilter(null)
        setTagFilter(null)
      }}
    >
      <Icon id={icon} size={15} />
      {label}
      <span className="n">{count}</span>
    </button>
  )

  return (
    <aside className="side">
      <div className="side-label">书架</div>
      {item('all', '全部书籍', 'i-book', total)}
      {item('recent', '最近阅读', 'i-clock', recent)}
      {item('reading', '未读完', 'i-bm', reading)}
      {item('done', '已读完', 'i-check', finished)}

      <div className="divider" />
      <div className="side-label">分组</div>
      {groups.length === 0 ? (
        <div className="side-hint">在书的封面右上角点「⋯」可以分组</div>
      ) : (
        groups.map(([name, count], index) => (
          <button
            key={name}
            className={`nav-item ${groupFilter === name ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setGroupFilter(groupFilter === name ? null : name)
              setView('all')
            }}
          >
            <span
              className="dot"
              style={{ background: DOT_COLORS[index % DOT_COLORS.length] }}
            />
            {name}
            <span className="n">{count}</span>
          </button>
        ))
      )}

      <div className="divider" />
      <div className="side-label">标签</div>
      {tags.length === 0 ? (
        <div className="side-hint">还没有标签</div>
      ) : (
        <div className="chips">
          {tags.map(([tag, count]) => (
            <button
              key={tag}
              className={`chip ${tagFilter === tag ? 'on' : ''}`}
              type="button"
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            >
              {tag} {count}
            </button>
          ))}
        </div>
      )}

      <div className="side-foot">
        <div className="store-row">
          <Icon id="i-folder" size={13} />
          本机书库<span style={{ marginLeft: 'auto' }}>{total} 本</span>
        </div>
        <div className="store-bar">
          <i style={{ width: `${Math.min(100, total * 4)}%` }} />
        </div>
        <button className="nav-item" type="button" onClick={() => setBookmarksOpen(true)}>
          <Icon id="i-bm" size={15} />
          全部书签
        </button>
        <button className="nav-item" type="button" onClick={() => setStatsOpen(true)}>
          <Icon id="i-chart" size={15} />
          阅读统计
        </button>
        <button className="nav-item" type="button" onClick={() => setSettingsOpen(true)}>
          <Icon id="i-set" size={15} />
          设置
        </button>
      </div>
    </aside>
  )
}
