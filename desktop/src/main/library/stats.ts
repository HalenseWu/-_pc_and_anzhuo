import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StatsDay, StatsBook, StatsSnapshot } from '../../shared/types'

interface RawStats {
  days: Record<string, { seconds: number; chars: number; minutes: Record<string, { s: number; c: number }> }>
  books: Record<string, { title: string; seconds: number; chars: number }>
}

const EMPTY: RawStats = { days: {}, books: {} }
const KEEP_DAYS = 120

function dateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function minuteKey(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export class StatsStore {
  private readonly file: string
  private data: RawStats = structuredClone(EMPTY)

  constructor(root: string) {
    this.file = join(root, 'stats.json')
    this.load()
  }

  private load(): void {
    try {
      const raw = readFileSync(this.file, 'utf-8')
      const parsed = JSON.parse(raw) as RawStats
      this.data = {
        days: parsed.days ?? {},
        books: parsed.books ?? {}
      }
    } catch {
      this.data = structuredClone(EMPTY)
    }
  }

  private save(): void {
    const temp = `${this.file}.tmp`
    writeFileSync(temp, JSON.stringify(this.data), 'utf-8')
    renameSync(temp, this.file)
  }

  add(bookId: string, title: string, seconds: number, chars: number): void {
    if (seconds <= 0 && chars <= 0) return
    const now = new Date()
    const day = dateKey(now)
    const minute = minuteKey(now)

    const record = (this.data.days[day] ??= { seconds: 0, chars: 0, minutes: {} })
    record.seconds += Math.max(0, Math.round(seconds))
    record.chars += Math.max(0, Math.round(chars))
    const bucket = (record.minutes[minute] ??= { s: 0, c: 0 })
    bucket.s += Math.max(0, Math.round(seconds))
    bucket.c += Math.max(0, Math.round(chars))

    if (bookId) {
      const book = (this.data.books[bookId] ??= { title, seconds: 0, chars: 0 })
      book.title = title || book.title
      book.seconds += Math.max(0, Math.round(seconds))
      book.chars += Math.max(0, Math.round(chars))
    }

    this.prune()
    this.save()
  }

  private prune(): void {
    const keys = Object.keys(this.data.days).sort()
    if (keys.length <= KEEP_DAYS) return
    for (const key of keys.slice(0, keys.length - KEEP_DAYS)) {
      delete this.data.days[key]
    }
  }

  snapshot(days = 30): StatsSnapshot {
    const today = dateKey()
    const keys = Object.keys(this.data.days).sort()
    const recent = keys.slice(-days).map((key) => ({
      date: key,
      seconds: this.data.days[key].seconds,
      chars: this.data.days[key].chars,
      minutes: this.data.days[key].minutes
    }))

    let streak = 0
    const cursor = new Date()
    for (let i = 0; i < 400; i += 1) {
      const key = dateKey(cursor)
      const day = this.data.days[key]
      if (day && day.seconds > 0) {
        streak += 1
        cursor.setDate(cursor.getDate() - 1)
      } else if (i === 0) {
        // 今天还没读也算连续（昨天读过就接着算）
        cursor.setDate(cursor.getDate() - 1)
      } else {
        break
      }
    }

    const books = Object.entries(this.data.books)
      .map(([bookId, value]) => ({ bookId, ...value }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 10)

    return {
      days: recent,
      today: recent.find((day) => day.date === today) ?? null,
      books,
      streak,
      totalSeconds: keys.reduce((sum, key) => sum + this.data.days[key].seconds, 0),
      totalChars: keys.reduce((sum, key) => sum + this.data.days[key].chars, 0)
    }
  }
}
