import { create } from 'zustand'
import type { StatsDay, StatsSnapshot } from '../core/types'
import { readJson, writeJson } from '../platform/storage'

interface StatsFile {
  version: 1
  days: Record<string, number>
  books: Record<string, { minutes: number; lastAt: number }>
}

const EMPTY: StatsFile = { version: 1, days: {}, books: {} }

function todayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface StatsState {
  file: StatsFile
  loaded: boolean
  load: () => Promise<void>
  addMinutes: (bookId: string, minutes: number) => Promise<void>
  snapshot: () => StatsSnapshot
  reset: () => Promise<void>
}

export const useStats = create<StatsState>((set, get) => ({
  file: EMPTY,
  loaded: false,

  load: async () => {
    const file = (await readJson<StatsFile>('stats.json')) ?? EMPTY
    set({ file: { version: 1, days: file.days ?? {}, books: file.books ?? {} }, loaded: true })
  },

  addMinutes: async (bookId, minutes) => {
    if (minutes <= 0) return
    const file = get().file
    const key = todayKey()
    const days = { ...file.days, [key]: Number(((file.days[key] ?? 0) + minutes).toFixed(2)) }
    const books = {
      ...file.books,
      [bookId]: {
        minutes: Number(((file.books[bookId]?.minutes ?? 0) + minutes).toFixed(2)),
        lastAt: Date.now()
      }
    }
    const next: StatsFile = { version: 1, days, books }
    set({ file: next })
    await writeJson('stats.json', next)
  },

  snapshot: () => {
    const file = get().file
    const keys = Object.keys(file.days).sort()
    const last14: StatsDay[] = []
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date()
      date.setDate(date.getDate() - offset)
      const key = todayKey(date)
      last14.push({ date: key.slice(5), minutes: Math.round((file.days[key] ?? 0) * 10) / 10 })
    }
    const total = keys.reduce((sum, key) => sum + (file.days[key] ?? 0), 0)
    let streak = 0
    for (let offset = 0; offset < 365; offset += 1) {
      const date = new Date()
      date.setDate(date.getDate() - offset)
      const key = todayKey(date)
      if ((file.days[key] ?? 0) > 0.2) streak += 1
      else if (offset > 0) break
    }
    return {
      days: last14,
      books: Object.fromEntries(
        Object.entries(file.books).map(([id, value]) => [id, { minutes: value.minutes, lastAt: value.lastAt }])
      ),
      totalMinutes: Math.round(total),
      streak,
      todayMinutes: Math.round((file.days[todayKey()] ?? 0) * 10) / 10
    }
  },

  reset: async () => {
    set({ file: EMPTY })
    await writeJson('stats.json', EMPTY)
  }
}))
