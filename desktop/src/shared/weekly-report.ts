import type { StatsSnapshot } from './types'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

function key(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分钟`
  return `${total} 秒`
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch] ?? ch)
}

export interface WeeklyReport {
  html: string
  fileName: string
  rangeLabel: string
}

/** 生成自包含的周报 HTML（不依赖任何外部资源，可直接打印成 PDF） */
export function buildWeeklyReport(snapshot: StatsSnapshot, now = new Date()): WeeklyReport {
  const days: { date: string; label: string; seconds: number; chars: number; minutes: Record<string, { s: number; c: number }> }[] = []
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(now)
    day.setDate(now.getDate() - i)
    const dateKey = key(day)
    const record = snapshot.days.find((item) => item.date === dateKey)
    days.push({
      date: dateKey,
      label: WEEK[day.getDay()],
      seconds: record?.seconds ?? 0,
      chars: record?.chars ?? 0,
      minutes: record?.minutes ?? {}
    })
  }

  const totalSeconds = days.reduce((sum, day) => sum + day.seconds, 0)
  const totalChars = days.reduce((sum, day) => sum + day.chars, 0)
  const activeDays = days.filter((day) => day.seconds > 0).length
  const speed = totalSeconds > 5 ? Math.round(totalChars / (totalSeconds / 60)) : 0
  const maxSeconds = Math.max(60, ...days.map((day) => day.seconds))

  const hours = Array.from({ length: 24 }, () => 0)
  for (const day of days) {
    for (const [minute, value] of Object.entries(day.minutes)) {
      const hour = Number(minute.slice(0, 2))
      if (Number.isFinite(hour)) hours[hour] += value.c
    }
  }
  const maxHour = Math.max(1, ...hours)
  const curvePoints = hours
    .map((value, index) => {
      const x = 28 + (index / 23) * 664
      const y = 150 - (value / maxHour) * 118
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const bars = days
    .map((day, index) => {
      const height = (day.seconds / maxSeconds) * 118
      const x = 28 + index * 94
      return `<g>
        <rect x="${x}" y="${150 - height}" width="48" height="${Math.max(2, height)}" rx="3" fill="#2e4a52" opacity="0.86"/>
        <text x="${x + 24}" y="168" font-size="10" fill="#8a8377" text-anchor="middle">${day.label}</text>
        ${day.seconds > 0 ? `<text x="${x + 24}" y="${142 - height}" font-size="10" fill="#6b655b" text-anchor="middle">${Math.round(day.seconds / 60)} 分</text>` : ''}
      </g>`
    })
    .join('')

  const books = snapshot.books
    .slice(0, 5)
    .map((book) => {
      const width = Math.max(2, Math.round((book.seconds / Math.max(1, snapshot.books[0].seconds)) * 100))
      return `<div class="book">
        <span class="book-title">${escapeXml(book.title)}</span>
        <span class="book-track"><i style="width:${width}%"></i></span>
        <span class="book-time">${duration(book.seconds)}</span>
      </div>`
    })
    .join('')

  const rangeLabel = `${days[0].date} — ${days[6].date}`
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<title>无涯 · 阅读周报 ${rangeLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 760px; margin: 0 auto; padding: 40px 44px 34px;
    background: #f7f3ea; color: #2b2823;
    font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .head { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 1px solid #e3daca; padding-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .seal { width: 30px; height: 30px; border-radius: 5px; background: #a8412f; color: #fbf3e6;
          display: grid; place-items: center; font-family: STZhongsong, serif; font-size: 16px; }
  .brand b { font-size: 17px; letter-spacing: .08em; }
  .head .meta { text-align: right; color: #8a8377; font-size: 11px; line-height: 1.7; }
  h1 { margin: 26px 0 4px; font-family: STZhongsong, "Source Han Serif SC", STSong, serif; font-size: 26px; font-weight: 600; }
  .sub { color: #6b655b; font-size: 12px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 22px 0 8px; }
  .card { border: 1px solid #e3daca; border-radius: 9px; padding: 12px 14px; background: #fbf8f1; }
  .card span { color: #6b655b; font-size: 10.5px; }
  .card b { display: block; margin-top: 6px; font-family: STZhongsong, "Source Han Serif SC", STSong, serif;
            font-size: 19px; color: #1f1d1a; }
  .card i { display: block; margin-top: 4px; color: #8a8377; font-size: 10px; font-style: normal; }
  h2 { margin: 26px 0 8px; font-size: 13px; color: #2b2823; font-weight: 600; display: flex; justify-content: space-between; align-items: baseline; }
  h2 span { color: #8a8377; font-size: 10.5px; font-weight: 400; }
  .panel { border: 1px solid #e3daca; border-radius: 9px; background: #fbf8f1; padding: 12px 14px 6px; }
  svg { width: 100%; height: auto; display: block; }
  .book { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 11.5px; }
  .book-title { flex: 0 0 240px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .book-track { flex: 1; height: 6px; border-radius: 3px; background: rgba(120,110,90,.14); }
  .book-track i { display: block; height: 100%; border-radius: 3px; background: #2e4a52; }
  .book-time { flex: 0 0 90px; text-align: right; color: #8a8377; font-size: 10.5px; }
  .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #e3daca; color: #8a8377; font-size: 10px;
          display: flex; justify-content: space-between; }
  @page { size: A4; margin: 12mm; }\n  @media print {\n    body { width: auto; padding: 0; margin: 0; }\n    .panel, .card, h2 { break-inside: avoid; }\n    .foot { break-inside: avoid; }\n  }
</style></head>
<body>
  <div class="head">
    <div class="brand"><span class="seal">涯</span><b>无涯 · 阅读周报</b></div>
    <div class="meta">${rangeLabel}<br/>生成于 ${key(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}</div>
  </div>

  <h1>${activeDays > 0 ? `本周读了 ${duration(totalSeconds)}` : '本周还没有阅读记录'}</h1>
  <p class="sub">${activeDays} 天有阅读 · 共 ${totalChars.toLocaleString()} 字${speed > 0 ? ` · 平均 ${speed} 字/分` : ''}</p>

  <div class="cards">
    <div class="card"><span>本周时长</span><b>${duration(totalSeconds)}</b><i>日均 ${duration(totalSeconds / 7)}</i></div>
    <div class="card"><span>本周字数</span><b>${totalChars.toLocaleString()}</b><i>按翻页折算</i></div>
    <div class="card"><span>平均速度</span><b>${speed > 0 ? `${speed} 字/分` : '—'}</b><i>阅读时段内</i></div>
    <div class="card"><span>连续阅读</span><b>${snapshot.streak} 天</b><i>累计 ${duration(snapshot.totalSeconds)}</i></div>
  </div>

  <h2>每天阅读时长<span>最近 7 天</span></h2>
  <div class="panel">
    <svg viewBox="0 0 700 180" preserveAspectRatio="none">
      <line x1="28" y1="150" x2="692" y2="150" stroke="#e3daca"/>
      ${bars}
    </svg>
  </div>

  <h2>阅读时段分布<span>一周内每小时的字数</span></h2>
  <div class="panel">
    <svg viewBox="0 0 720 180" preserveAspectRatio="none">
      <line x1="28" y1="150" x2="692" y2="150" stroke="#e3daca"/>
      <line x1="28" y1="92" x2="692" y2="92" stroke="#efe9dc"/>
      <line x1="28" y1="34" x2="692" y2="34" stroke="#efe9dc"/>
      <polyline points="${curvePoints}" fill="none" stroke="#a8412f" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${[0, 6, 12, 18, 23]
        .map(
          (hour) =>
            `<text x="${28 + (hour / 23) * 664}" y="170" font-size="10" fill="#8a8377" text-anchor="middle">${hour}:00</text>`
        )
        .join('')}
    </svg>
  </div>

  <h2>书籍排行<span>按累计阅读时长</span></h2>
  <div class="panel">
    ${books || '<div style="padding:18px;text-align:center;color:#8a8377;font-size:11px">还没有阅读记录</div>'}
  </div>

  <div class="foot"><span>无涯 · 本地阅读，数据只存在本机</span><span>${rangeLabel}</span></div>
</body></html>`

  return {
    html,
    fileName: `无涯周报-${days[0].date}-${days[6].date}.html`,
    rangeLabel
  }
}
