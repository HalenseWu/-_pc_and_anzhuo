import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { BookMeta, ChapterNode, ImportProgress, ImportResult, ParseReport } from '../../shared/types'
import { detectChapters } from '../parser/chapters'
import { cleanText } from '../parser/clean'
import { decodeBuffer } from '../parser/encoding'
import { parseEpub } from '../parser/epub'
import type { LibraryStore } from './store'

const COVER_PALETTE: [string, string][] = [
  ['#2E4A52', '#1B3035'],
  ['#6E2B2B', '#4A1B1B'],
  ['#3A3F4B', '#242833'],
  ['#45625C', '#2C4440'],
  ['#7A4A2B', '#55301A'],
  ['#2F3E5C', '#1D283E'],
  ['#5A5048', '#3A322C'],
  ['#6B4A63', '#432B3D'],
  ['#3E5566', '#263743'],
  ['#4B4A5C', '#2E2D3C']
]

function pickCover(seed: string): [string, string] {
  const hex = seed.slice(0, 8).replace(/[^0-9a-f]/gi, '')
  let value = 0
  if (hex.length >= 6) {
    value = parseInt(hex, 16)
  } else {
    for (let i = 0; i < seed.length; i += 1) value = (value * 31 + seed.charCodeAt(i)) >>> 0
  }
  return COVER_PALETTE[value % COVER_PALETTE.length]
}

const AUTHOR_RE = /[（(【\[]?\s*(?:作者|作\s*者)\s*[:：]?\s*([^\s（(【\[）)】\]，,。.、]{1,20})\s*[）)】\]]?/

function parseTitle(fileName: string): { title: string; author: string } {
  let base = fileName.replace(/\.[^.]+$/, '')
  const authorMatch = base.match(AUTHOR_RE)
  const author = authorMatch?.[1]?.trim() ?? ''

  base = base
    .replace(AUTHOR_RE, '')
    .replace(/[（(【\[]\s*[）)】\]]/g, '')
    .replace(/[（(【\[](全本|完结|精校|校对|完本|TXT|txt)[)）】\]]/g, '')
    .replace(/[_\-\s]+$/g, '')
    .trim()

  const bracketed = base.match(/^《(.+)》$/)
  if (bracketed) base = bracketed[1]

  return { title: base || fileName, author: author || '佚名' }
}

function flatten(nodes: ChapterNode[]): ChapterNode[] {
  const out: ChapterNode[] = []
  for (const node of nodes) {
    if (node.children?.length) out.push(...node.children)
    else out.push(node)
  }
  return out
}

export interface ImportContext {
  store: LibraryStore
  emit: (progress: ImportProgress) => void
  taskId: string
}

function baseProgress(ctx: ImportContext, filePath: string): {
  report: (phase: ImportProgress['phase'], percent: number, message?: string) => void
  fileName: string
} {
  const fileName = basename(filePath)
  return {
    fileName,
    report: (phase, percent, message) =>
      ctx.emit({ taskId: ctx.taskId, file: filePath, fileName, phase, percent, message })
  }
}

/** TXT：编码探测 → 清洗 → 目录识别 */
async function importTxt(
  ctx: ImportContext,
  filePath: string,
  buffer: Buffer,
  info: { size: number; mtimeMs: number },
  hash: string
): Promise<ImportResult> {
  const { store } = ctx
  const { fileName, report } = baseProgress(ctx, filePath)

  report('decode', 14)
  const decoded = decodeBuffer(buffer)

  report('clean', 30)
  const content = cleanText(decoded.text)

  report('chapters', 58)
  const started = Date.now()
  const detected = detectChapters(content)
  const chapters = flatten(detected.toc)
  const elapsedMs = Date.now() - started

  const id = `b_${hash.slice(0, 10)}`
  const { title, author } = parseTitle(fileName)

  const parseReport: ParseReport = {
    encoding: decoded.encoding,
    encodingConfidence: decoded.confidence,
    totalChars: content.length,
    volumeCount: detected.volumeCount,
    chapterCount: detected.chapterCount,
    elapsedMs,
    suspicious: detected.suspicious,
    fallback: detected.fallback
  }

  const book: BookMeta = {
    id,
    title,
    author,
    format: 'TXT',
    sourcePath: filePath,
    sourceSize: info.size,
    sourceMtime: info.mtimeMs,
    sourceHash: hash,
    totalChars: content.length,
    chapterCount: chapters.length,
    pageCount: 0,
    volumeCount: detected.volumeCount,
    encoding: decoded.encoding,
    addedAt: Date.now(),
    updatedAt: Date.now(),
    lastReadAt: null,
    progress: 0,
    currentChapterId: chapters[0]?.id ?? null,
    anchor: null,
    cover: pickCover(hash),
    coverImage: null,
    group: null,
    tags: []
  }

  report('write', 86)
  store.writeBookFiles(id, content, detected.toc, book)
  store.upsert(book)

  ;(book as BookMeta & { report?: ParseReport }).report = parseReport
  report('done', 100, `${chapters.length} 章`)
  return { ok: true, book }
}

/** EPUB：自带目录，直接按 spine 拆章 */
async function importEpub(
  ctx: ImportContext,
  filePath: string,
  buffer: Buffer,
  info: { size: number; mtimeMs: number },
  hash: string
): Promise<ImportResult> {
  const { store } = ctx
  const { fileName, report } = baseProgress(ctx, filePath)

  report('decode', 18, '解包 EPUB')
  const parsed = parseEpub(buffer)

  report('chapters', 70, `${parsed.chapterCount} 章`)
  const id = `b_${hash.slice(0, 10)}`
  const fallback = parseTitle(fileName)
  const coverImage = parsed.cover ? store.writeCover(id, parsed.cover.data, parsed.cover.ext) : null

  const book: BookMeta = {
    id,
    title: parsed.title && parsed.title !== '未命名' ? parsed.title : fallback.title,
    author: parsed.author && parsed.author !== '佚名' ? parsed.author : fallback.author,
    format: 'EPUB',
    sourcePath: filePath,
    sourceSize: info.size,
    sourceMtime: info.mtimeMs,
    sourceHash: hash,
    totalChars: parsed.content.length,
    chapterCount: parsed.chapterCount,
    pageCount: 0,
    volumeCount: parsed.toc.filter((node) => node.children?.length).length,
    encoding: 'UTF-8',
    addedAt: Date.now(),
    updatedAt: Date.now(),
    lastReadAt: null,
    progress: 0,
    currentChapterId: flatten(parsed.toc)[0]?.id ?? null,
    anchor: null,
    cover: pickCover(hash),
    coverImage,
    group: null,
    tags: []
  }

  report('write', 88)
  if (parsed.images.length > 0) store.writeImages(id, parsed.images)
  store.writeBookFiles(id, parsed.content, parsed.toc, book)
  store.upsert(book)

  report('done', 100, `${parsed.chapterCount} 章`)
  return { ok: true, book }
}

export async function importBookFile(ctx: ImportContext, filePath: string): Promise<ImportResult> {
  const { store } = ctx
  const { report } = baseProgress(ctx, filePath)

  try {
    report('hash', 4)
    const info = await stat(filePath)
    const buffer = await readFile(filePath)
    const hash = createHash('sha1').update(buffer).digest('hex')

    const existing = store.findByHash(hash)
    if (existing) {
      report('done', 100, '已存在')
      return { ok: true, skipped: 'duplicate', book: existing }
    }

    const ext = extname(filePath).toLowerCase()
    if (ext === '.epub') return await importEpub(ctx, filePath, buffer, info, hash)
    if (ext === '.pdf') return await importPdf(ctx, filePath, buffer, info, hash)
    if (ext === '.txt') return await importTxt(ctx, filePath, buffer, info, hash)

    throw new Error(`暂不支持 ${ext || '该'} 格式`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    report('error', 100, message)
    return { ok: false, error: message }
  }
}

export const importTxtFile = importBookFile
/** PDF：原样保存，页数由渲染端首次打开时回填 */
async function importPdf(
  ctx: ImportContext,
  filePath: string,
  buffer: Buffer,
  info: { size: number; mtimeMs: number },
  hash: string
): Promise<ImportResult> {
  const { store } = ctx
  const { fileName, report } = baseProgress(ctx, filePath)

  report('decode', 30, '检查 PDF')
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('不是有效的 PDF 文件')
  }

  const id = `b_${hash.slice(0, 10)}`
  const { title, author } = parseTitle(fileName)
  report('write', 80)

  const book: BookMeta = {
    id,
    title,
    author,
    format: 'PDF',
    sourcePath: filePath,
    sourceSize: info.size,
    sourceMtime: info.mtimeMs,
    sourceHash: hash,
    totalChars: 0,
    chapterCount: 0,
    pageCount: 0,
    volumeCount: 0,
    encoding: 'binary',
    addedAt: Date.now(),
    updatedAt: Date.now(),
    lastReadAt: null,
    progress: 0,
    currentChapterId: null,
    anchor: null,
    cover: pickCover(hash),
    coverImage: null,
    group: null,
    tags: []
  }

  store.writeSourcePdf(id, buffer)
  store.writeBookFiles(id, '', [], book)
  store.upsert(book)

  report('done', 100, '已导入 PDF')
  return { ok: true, book }
}