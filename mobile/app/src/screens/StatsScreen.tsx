import { useEffect } from 'react'
import { useStats } from '../store/stats'
import { useLibrary } from '../store/library'

export function StatsScreen({ onClose }: { onClose: () => void }): React.JSX.Element {
  const load = useStats((state) => state.load)
  const loaded = useStats((state) => state.loaded)
  const snapshot = useStats((state) => state.snapshot)
  const books = useLibrary((state) => state.books)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const stats = snapshot()
  const max = Math.max(10, ...stats.days.map((day) => day.minutes))
  const bookName = (id: string): string => books.find((book) => book.id === id)?.title ?? '未知书籍'
  const ranking = Object.entries(stats.books)
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 5)

  return (
    <div className="screen stats">
      <header className="lib-head">
        <button className="icon-btn" type="button" onClick={onClose}>
          ‹
        </button>
        <h1>阅读统计</h1>
      </header>

      <div className="stats-cards">
        <div className="stat-card">
          <span className="stat-num">{stats.todayMinutes}</span>
          <span className="stat-label">今日分钟</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{stats.totalMinutes}</span>
          <span className="stat-label">累计分钟</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{stats.streak}</span>
          <span className="stat-label">连续天数</span>
        </div>
      </div>

      <div className="stats-chart">
        {stats.days.map((day) => (
          <div key={day.date} className="bar-wrap">
            <div className="bar" style={{ height: `${Math.max(3, (day.minutes / max) * 100)}%` }} />
            <span className="bar-label">{day.date.slice(3)}</span>
          </div>
        ))}
      </div>
      <p className="stats-hint">最近 14 天（单位：分钟）</p>

      <div className="stats-ranking">
        <h3>读得最多</h3>
        {ranking.length === 0 ? <div className="drawer-empty">还没有记录，读几分钟再来看看</div> : null}
        {ranking.map(([id, value]) => (
          <div key={id} className="rank-row">
            <span className="rank-name">{bookName(id)}</span>
            <span className="rank-value">{Math.round(value.minutes)} 分钟</span>
          </div>
        ))}
      </div>
    </div>
  )
}
