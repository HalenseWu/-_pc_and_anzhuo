import JSZip from 'jszip'
import type { BookMeta, LibraryIndex } from './types'
import { readJson, readText, readBytes, writeJson, writeText, writeBytes } from '../platform/storage'

const TEXT_FILES = ['content.txt', 'toc.json', 'meta.json', 'marks.json', 'notes.json']

export interface Manifest {
  app: 'wuya'
  version: 1
  platform: string
  createdAt: number
  books: number
}

interface ExportOptions {
  library: BookMeta[]
  stats: unknown
}

function stamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

export function backupFileName(): string {
  return `无涯备份-${stamp()}.wuya`
}

export async function exportBackup(options: ExportOptions): Promise<Blob> {
  const zip = new JSZip()
  const manifest: Manifest = {
    app: 'wuya',
    version: 1,
    platform: 'android',
    createdAt: Date.now(),
    books: options.library.length
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('library.json', JSON.stringify({ version: 1, books: options.library }, null, 2))
  zip.file('stats.json', JSON.stringify(options.stats ?? {}, null, 2))

  for (const book of options.library) {
    for (const name of TEXT_FILES) {
      const text = await readText(`books/${book.id}/${name}`)
      if (text !== null) zip.file(`books/${book.id}/${name}`, text)
    }
    if (book.format === 'PDF') {
      const bytes = await readBytes(`books/${book.id}/source.pdf`)
      if (bytes) zip.file(`books/${book.id}/source.pdf`, bytes)
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export interface ImportResult {
  added: number
  skipped: number
  total: number
}

export async function importBackup(file: Blob): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file)
  const manifestText = await zip.file('manifest.json')?.async('text')
  if (!manifestText) throw new Error('不是有效的无涯备份（缺少 manifest）')
  const manifest = JSON.parse(manifestText) as Manifest
  if (manifest.app !== 'wuya') throw new Error('不是无涯的备份包')

  const libraryText = await zip.file('library.json')?.async('text')
  if (!libraryText) throw new Error('备份里没有书架数据')
  const incoming = JSON.parse(libraryText) as LibraryIndex
  const current = (await readJson<LibraryIndex>('library.json')) ?? { version: 1, books: [] }

  const known = new Set(current.books.map((book) => book.id))
  let added = 0
  let skipped = 0
  for (const book of incoming.books ?? []) {
    if (known.has(book.id)) {
      skipped += 1
      continue
    }
    for (const name of TEXT_FILES) {
      const entry = zip.file(`books/${book.id}/${name}`)
      if (!entry) continue
      await writeText(`books/${book.id}/${name}`, await entry.async('text'))
    }
    const pdf = zip.file(`books/${book.id}/source.pdf`)
    if (pdf) await writeBytes(`books/${book.id}/source.pdf`, await pdf.async('uint8array'))
    current.books.push(book)
    known.add(book.id)
    added += 1
  }

  await writeJson('library.json', { version: 1, books: current.books })

  /* 统计按「每天取较大值」合并，避免同一份备份重复导入把时长翻倍 */
  const statsText = await zip.file('stats.json')?.async('text')
  if (statsText) {
    try {
      const incomingStats = JSON.parse(statsText) as {
        days?: Record<string, number>
        books?: Record<string, { minutes: number; lastAt: number }>
      }
      const currentStats =
        (await readJson<{ days?: Record<string, number>; books?: Record<string, { minutes: number; lastAt: number }> }>(
          'stats.json'
        )) ?? {}
      const days: Record<string, number> = { ...(currentStats.days ?? {}) }
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
      await writeJson('stats.json', { version: 1, days, books })
    } catch {
      /* 统计损坏就跳过，不影响书 */
    }
  }

  return { added, skipped, total: (incoming.books ?? []).length }
}
