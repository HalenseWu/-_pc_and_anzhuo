import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import JSZip from 'jszip'
import type { BookMeta, LibraryIndex } from '../shared/types'
import type { LibraryStore } from './library/store'
import type { StatsStore } from './library/stats'

const TEXT_FILES = ['content.txt', 'toc.json', 'meta.json', 'marks.json', 'notes.json']

function stamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

export function defaultBackupName(): string {
  return `无涯备份-${stamp()}.wuya`
}

export async function exportBackup(store: LibraryStore, stats: StatsStore, target: string): Promise<number> {
  const index = JSON.parse(readFileSync(join(store.root, 'library.json'), 'utf-8')) as LibraryIndex
  const zip = new JSZip()
  zip.file(
    'manifest.json',
    JSON.stringify(
      { app: 'wuya', version: 1, platform: 'windows', createdAt: Date.now(), books: index.books.length },
      null,
      2
    )
  )
  zip.file('library.json', JSON.stringify(index, null, 2))
  const statsFile = join(store.root, 'stats.json')
  if (existsSync(statsFile)) zip.file('stats.json', readFileSync(statsFile))

  for (const book of index.books) {
    for (const name of TEXT_FILES) {
      const file = join(store.root, 'books', book.id, name)
      if (existsSync(file)) zip.file(`books/${book.id}/${name}`, readFileSync(file))
    }
    if (book.format === 'PDF') {
      const pdf = join(store.root, 'books', book.id, 'source.pdf')
      if (existsSync(pdf)) zip.file(`books/${book.id}/source.pdf`, readFileSync(pdf))
    }
    const imagesDir = join(store.root, 'books', book.id, 'images')
    if (existsSync(imagesDir)) {
      for (const image of readdirSync(imagesDir)) {
        zip.file(`books/${book.id}/images/${image}`, readFileSync(join(imagesDir, image)))
      }
    }
  }

  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  writeFileSync(target, data)
  return data.length
}

export interface ImportSummary {
  added: number
  skipped: number
  total: number
}

export async function importBackup(
  store: LibraryStore,
  filePath: string
): Promise<ImportSummary> {
  const data = readFileSync(filePath)
  const zip = await JSZip.loadAsync(data)
  const manifestText = await zip.file('manifest.json')?.async('text')
  if (!manifestText) throw new Error('不是有效的无涯备份（缺少 manifest）')
  const manifest = JSON.parse(manifestText) as { app?: string }
  if (manifest.app !== 'wuya') throw new Error('不是无涯的备份包')

  const libraryText = await zip.file('library.json')?.async('text')
  if (!libraryText) throw new Error('备份里没有书架数据')
  const incoming = JSON.parse(libraryText) as LibraryIndex
  const currentText = readFileSync(join(store.root, 'library.json'), 'utf-8')
  const current = JSON.parse(currentText) as LibraryIndex
  const known = new Set(current.books.map((book) => book.id))

  let added = 0
  let skipped = 0
  for (const book of incoming.books ?? []) {
    if (known.has(book.id)) {
      skipped += 1
      continue
    }
    const dir = join(store.root, 'books', book.id)
    mkdirSync(dir, { recursive: true })
    for (const name of TEXT_FILES) {
      const entry = zip.file(`books/${book.id}/${name}`)
      if (!entry) continue
      writeFileSync(join(dir, name), await entry.async('nodebuffer'))
    }
    const pdf = zip.file(`books/${book.id}/source.pdf`)
    if (pdf) {
      writeFileSync(join(dir, 'source.pdf'), await pdf.async('nodebuffer'))
    }
    current.books.push(book as BookMeta)
    known.add(book.id)
    added += 1
  }

  writeFileSync(join(store.root, 'library.json'), JSON.stringify(current, null, 2))

  /* 统计合并：同日取较大值 */
  const statsText = await zip.file('stats.json')?.async('text')
  if (statsText) {
    try {
      const incomingStats = JSON.parse(statsText) as {
        days?: Record<string, number>
        books?: Record<string, { minutes: number; lastAt: number }>
      }
      const statsFile = join(store.root, 'stats.json')
      const currentStats = existsSync(statsFile)
        ? (JSON.parse(readFileSync(statsFile, 'utf-8')) as {
            days?: Record<string, number>
            books?: Record<string, { minutes: number; lastAt: number }>
          })
        : {}
      const days = { ...(currentStats.days ?? {}) }
      for (const [key, value] of Object.entries(incomingStats.days ?? {})) {
        days[key] = Math.max(days[key] ?? 0, value)
      }
      const books = { ...(currentStats.books ?? {}) }
      for (const [id, value] of Object.entries(incomingStats.books ?? {})) {
        const old = books[id]
        books[id] = old
          ? { minutes: Math.max(old.minutes, value.minutes), lastAt: Math.max(old.lastAt, value.lastAt) }
          : value
      }
      writeFileSync(statsFile, JSON.stringify({ version: 1, days, books }, null, 2))
    } catch {
      /* 统计损坏就跳过 */
    }
  }

  return { added, skipped, total: (incoming.books ?? []).length }
}

export function backupTargetName(target: string): string {
  return basename(target)
}
