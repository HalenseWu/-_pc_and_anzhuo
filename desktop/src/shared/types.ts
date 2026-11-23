export type BookFormat = 'TXT' | 'EPUB' | 'PDF'

export interface ChapterNode {
  id: string
  title: string
  /** 1 = 卷，2 = 章 */
  level: 1 | 2
  /** 在 content.txt 中的字符偏移（含） */
  start: number
  /** 字符偏移（不含） */
  end: number
  chars: number
  children?: ChapterNode[]
}

export interface ReadAnchor {
  /** 章内段落序号（0 起） */
  block: number
  /** 段内字符偏移 */
  offset: number
}

export interface BookMeta {
  id: string
  title: string
  author: string
  format: BookFormat
  sourcePath: string
  sourceSize: number
  sourceMtime: number
  sourceHash: string
  totalChars: number
  chapterCount: number
  /** PDF 专用：总页数，其他格式为 0 */
  pageCount: number
  volumeCount: number
  encoding: string
  addedAt: number
  updatedAt: number
  lastReadAt: number | null
  /** 0–100 */
  progress: number
  currentChapterId: string | null
  anchor: ReadAnchor | null
  cover: [string, string]
  /** 真实封面文件名（相对 images 目录），没有则为 null */
  coverImage: string | null
  /** 分组名，null 表示未分组 */
  group: string | null
  /** 标签 */
  tags: string[]
}

export interface LibraryIndex {
  version: 1
  books: BookMeta[]
}

export type SuspiciousKind = 'short' | 'duplicate' | 'gap' | 'fallback'

export interface SuspiciousItem {
  chapterId: string
  title: string
  kind: SuspiciousKind
  detail: string
}

export interface ParseReport {
  encoding: string
  encodingConfidence: number
  totalChars: number
  volumeCount: number
  chapterCount: number
  elapsedMs: number
  suspicious: SuspiciousItem[]
  fallback: boolean
}

export type ImportPhase = 'hash' | 'decode' | 'clean' | 'chapters' | 'write' | 'done' | 'error'

export interface ImportProgress {
  taskId: string
  file: string
  fileName: string
  phase: ImportPhase
  percent: number
  message?: string
}

export interface ImportResult {
  ok: boolean
  book?: BookMeta
  skipped?: 'duplicate'
  error?: string
}

export interface ReadChapter {
  id: string
  title: string
  volumeTitle: string | null
  index: number
  total: number
  paragraphs: string[]
  /** 每段相对本章开头的字符偏移，用于定位搜索命中 */
  starts: number[]
}

export interface Bookmark {
  id: string
  chapterId: string
  chapterTitle: string
  anchor: ReadAnchor
  excerpt: string
  createdAt: number
}

export interface Note {
  id: string
  chapterId: string
  chapterTitle: string
  anchor: ReadAnchor
  quote: string
  text: string
  createdAt: number
}

export interface Marks {
  bookmarks: Bookmark[]
  notes: Note[]
}

export interface SearchHit {
  chapterId: string
  chapterTitle: string
  /** 相对本章开头的字符偏移 */
  offsetInChapter: number
  excerpt: string
  matchStart: number
  matchLength: number
}
export interface LibrarySearchGroup {
  bookId: string
  title: string
  author: string
  format: string
  hits: SearchHit[]
}
export interface StatsDay {
  date: string
  seconds: number
  chars: number
  minutes: Record<string, { s: number; c: number }>
}

export interface StatsBook {
  bookId: string
  title: string
  seconds: number
  chars: number
}

export interface StatsSnapshot {
  days: StatsDay[]
  today: StatsDay | null
  books: StatsBook[]
  streak: number
  totalSeconds: number
  totalChars: number
}

export interface TtsConfig {
  engine: 'gpt-sovits' | 'sapi'
  host: string
  port: number
  gsvRoot: string
  gptWeights: string
  sovitsWeights: string
  refAudio: string
  promptText: string
  promptLang: string
  textLang: string
  sapiVoice: string
  autoStart: boolean
}

export interface TtsStatus {
  running: boolean
  ready: boolean
  message: string
}
