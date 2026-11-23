import { useEffect, useMemo, useRef, useState } from 'react'
import type { StatsSnapshot } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { WindowButtons } from '../components/WindowButtons'
import { useLibrary } from '../stores/library'
import { buildWeeklyReport } from '../../../shared/weekly-report'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fmtDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分钟`
  return `${total} 秒`
}

export function Stats(): React.JSX.Element | null {
  const open = useLibrary((state) => state.statsOpen)
  const setOpen = useLibrary((state) => state.setStatsOpen)
  const [snapshot, setSnapshot] = useState<StatsSnapshot | null>(null)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const exportedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    void window.wuya?.stats.get().then((value) => setSnapshot(value))
  }, [open])

  const exportReport = async (): Promise<void> => {
    if (!snapshot) return
    const report = buildWeeklyReport(snapshot)
    setExporting(true)
    const target = await window.wuya?.stats.exportReport(report.html, report.fileName)
    setExporting(false)
    if (target) {
      setNotice(`已导出：${target}`)
      window.setTimeout(() => setNotice(null), 4000)
    }
  }

  /* 开发/深链：#stats?export=1 自动导出（配合 WUYA_EXPORT_PATH） */
  useEffect(() => {
    if (!open || !snapshot || exportedRef.current) return
    if (!location.hash.includes('export=1')) return
    exportedRef.current = true
    void exportReport()
  }, [open, snapshot])

  const week = useMemo(() => {
    const today = new Date()
    const out: { date: string; label: string; seconds: number; chars: number }[] = []
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today)
      day.setDate(today.getDate() - i)
      const key = dayKey(day)
      const record = snapshot?.days.find((item) => item.date === key)
      out.push({
        date: key,
        label: WEEK[day.getDay()],
        seconds: record?.seconds ?? 0,
        chars: record?.chars ?? 0
      })
    }
    return out
  }, [snapshot])

  const curve = useMemo(() => {
    const hours = Array.from({ length: 24 }, () => 0)
    for (const [key, value] of Object.entries(snapshot?.today?.minutes ?? {})) {
      const hour = Number(key.slice(0, 2))
      if (Number.isFinite(hour)) hours[hour] += value.c
    }
    return hours
  }, [snapshot])

  if (!open) return null

  const todaySeconds = snapshot?.today?.seconds ?? 0
  const todayChars = snapshot?.today?.chars ?? 0
  const speed = todaySeconds > 5 ? Math.round(todayChars / (todaySeconds / 60)) : 0
  const maxWeek = Math.max(60, ...week.map((item) => item.seconds))
  const maxHour = Math.max(1, ...curve)
  const maxBook = Math.max(1, ...(snapshot?.books.map((book) => book.seconds) ?? [1]))

  const points = curve
    .map((value, index) => {
      const x = 24 + (index / 23) * 720
      const y = 168 - (value / maxHour) * 132
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <div className="st-root">
      <header className="st-tb">
        <div className="st-tb-l">
          <button className="iconbtn" type="button" title="返回书架" onClick={() => setOpen(false)}>
            <Icon id="i-left" />
          </button>
          <span className="st-title">阅读统计</span>
        </div>
        <div className="st-tb-r">
          <button
            className="st-export"
            type="button"
            disabled={!snapshot || exporting}
            onClick={() => void exportReport()}
          >
            {exporting ? '导出中…' : '导出周报'}
          </button>
          <WindowButtons />
        </div>
      </header>

      <div className="st-body">
        <div className="st-cards">
          <div className="st-card">
            <span>今日阅读</span>
            <b>{fmtDuration(todaySeconds)}</b>
            <i>{speed > 0 ? `${speed} 字/分` : '还没开始'}</i>
          </div>
          <div className="st-card">
            <span>今日字数</span>
            <b>{todayChars.toLocaleString()}</b>
            <i>按翻页折算</i>
          </div>
          <div className="st-card">
            <span>连续阅读</span>
            <b>{snapshot?.streak ?? 0} 天</b>
            <i>累计 {fmtDuration(snapshot?.totalSeconds ?? 0)}</i>
          </div>
          <div className="st-card">
            <span>累计字数</span>
            <b>{(snapshot?.totalChars ?? 0).toLocaleString()}</b>
            <i>全部书籍</i>
          </div>
        </div>

        <section className="st-panel">
          <div className="st-panel-head">
            最近 7 天
            <span>每天阅读时长</span>
          </div>
          <svg className="st-bars" viewBox="0 0 780 190" preserveAspectRatio="none">
            {week.map((item, index) => {
              const height = (item.seconds / maxWeek) * 132
              const x = 24 + index * 106
              return (
                <g key={item.date}>
                  <rect x={x} y={168 - height} width={54} height={Math.max(2, height)} rx={3} className="st-bar" />
                  <text x={x + 27} y={184} className="st-axis" textAnchor="middle">
                    {item.label}
                  </text>
                  {item.seconds > 0 ? (
                    <text x={x + 27} y={160 - height} className="st-value" textAnchor="middle">
                      {Math.round(item.seconds / 60)} 分
                    </text>
                  ) : null}
                </g>
              )
            })}
          </svg>
        </section>

        <section className="st-panel">
          <div className="st-panel-head">
            今日速度曲线
            <span>每小时的阅读字数</span>
          </div>
          <svg className="st-line" viewBox="0 0 780 190" preserveAspectRatio="none">
            <line x1="24" y1="168" x2="744" y2="168" className="st-grid" />
            <line x1="24" y1="102" x2="744" y2="102" className="st-grid" />
            <line x1="24" y1="36" x2="744" y2="36" className="st-grid" />
            <polyline points={points} className="st-path" />
            {[0, 6, 12, 18, 23].map((hour) => (
              <text key={hour} x={24 + (hour / 23) * 720} y={186} className="st-axis" textAnchor="middle">
                {hour}:00
              </text>
            ))}
          </svg>
        </section>

        <section className="st-panel">
          <div className="st-panel-head">
            书籍排行
            <span>按阅读时长</span>
          </div>
          {snapshot && snapshot.books.length > 0 ? (
            <div className="st-books">
              {snapshot.books.slice(0, 5).map((book) => (
                <div className="st-book" key={book.bookId}>
                  <span className="st-book-title">{book.title}</span>
                  <div className="st-book-track">
                    <i style={{ width: `${(book.seconds / maxBook) * 100}%` }} />
                  </div>
                  <span className="st-book-time">{fmtDuration(book.seconds)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="st-empty">还没有统计数据，读几分钟再来看看。</div>
          )}
        </section>
      </div>
      {notice ? <div className="st-notice">{notice}</div> : null}
    </div>
  )
}
