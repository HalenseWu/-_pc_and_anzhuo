import { cleanText } from './clean'
import { detectChapters } from './chapters'
import { decodeBuffer } from './encoding'
import type { BookMeta, ChapterNode } from './types'

const COVERS: [string, string][] = [
  ['#2F4A5C', '#7BA6A6'],
  ['#5C3A3A', '#B07A6A'],
  ['#3C4A3A', '#8FA37B'],
  ['#4A3C58', '#9B87B5'],
  ['#5A4A32', '#C0A06A'],
  ['#33414F', '#7E93A8'],
  ['#5B3644', '#B0798F'],
  ['#3A4B45', '#84A79B']
]

function hashString(value: string): number {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
  }
  return hash
}

export function pickCover(seed: string): [string, string] {
  return COVERS[hashString(seed) % COVERS.length]
}

export function parseTitle(fileName: string): { title: string; author: string } {
  const base = fileName.replace(/\.[^.]+$/, '')
  const match = base.match(/^(.+?)\s*[（(【\[]?\s*(?:作者[:：]?\s*)?([^）)】\]]*)[）)】\]]?$/)
  const cleaned = base.replace(/[（(【\[].*?[）)】\]]/g, '').replace(/作者[:：].*$/, '').trim()
  return {
    title: (cleaned || match?.[1] || base).trim() || '未命名',
    author: '佚名'
  }
}

/** 和桌面版一致：卷节点有子章就展开子章，否则当作独立章 */
export function flattenChapters(nodes: ChapterNode[]): ChapterNode[] {
  const out: ChapterNode[] = []
  for (const node of nodes) {
    if (node.children?.length) out.push(...node.children)
    else out.push(node)
  }
  return out
}

export interface ParsedTxt {
  content: string
  tocs: ChapterNode[]
  chapters: ChapterNode[]
  encoding: string
  volumeCount: number
  chapterCount: number
}

export function parseTxt(buffer: ArrayBuffer): ParsedTxt {
  const decoded = decodeBuffer(buffer)
  const content = cleanText(decoded.text)
  const detected = detectChapters(content)
  const chapters = flattenChapters(detected.toc)
  return {
    content,
    tocs: detected.toc,
    chapters,
    encoding: decoded.encoding,
    volumeCount: detected.volumeCount,
    chapterCount: detected.chapterCount
  }
}

export function makeBookMeta(
  fileName: string,
  size: number,
  parsed: ParsedTxt,
  hash: string
): BookMeta {
  const { title, author } = parseTitle(fileName)
  const now = Date.now()
  return {
    id: `b_${hash.slice(0, 10)}`,
    title,
    author,
    format: 'TXT',
    sourceName: fileName,
    sourceSize: size,
    sourceHash: hash,
    totalChars: parsed.content.length,
    chapterCount: parsed.chapters.length,
    pageCount: 0,
    volumeCount: parsed.volumeCount,
    encoding: parsed.encoding,
    addedAt: now,
    updatedAt: now,
    lastReadAt: null,
    progress: 0,
    currentChapterId: parsed.chapters[0]?.id ?? null,
    anchor: null,
    cover: pickCover(hash),
    coverImage: null,
    group: null,
    tags: []
  }
}

/** 从整本书里切出一章，按空行拆段 */
export function sliceChapter(
  content: string,
  chapter: ChapterNode
): { paragraphs: string[]; chars: number } {
  const raw = content.slice(chapter.start, chapter.end)
  const body = raw.replace(/^[^\n]*\n/, '')
  const paragraphs = body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return { paragraphs, chars: raw.length }
}

export async function sha1(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
