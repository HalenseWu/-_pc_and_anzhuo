export type BookFormat = 'TXT' | 'EPUB' | 'PDF'

export interface ChapterNode {
  id: string
  title: string
  level: 1 | 2
  start: number
  end: number
  chars: number
  children?: ChapterNode[]
}

export interface ReadAnchor {
  block: number
  offset: number
  /** 分页模式下的页码（0 起），用于精确还原 */
  page?: number
}

export interface BookMeta {
  id: string
  title: string
  author: string
  format: BookFormat
  sourceName: string
  sourceSize: number
  sourceHash: string
  totalChars: number
  chapterCount: number
  pageCount: number
  volumeCount: number
  encoding: string
  addedAt: number
  updatedAt: number
  lastReadAt: number | null
  progress: number
  currentChapterId: string | null
  anchor: ReadAnchor | null
  cover: [string, string]
  coverImage: string | null
  group: string | null
  tags: string[]
}

export interface LibraryIndex {
  version: 1
  books: BookMeta[]
}

export interface ReadChapter {
  id: string
  title: string
  volumeTitle: string | null
  index: number
  paragraphs: string[]
  chars: number
}

export interface ReaderSettings {
  theme: 'paper' | 'sepia' | 'green' | 'night' | 'black'
  fontId: 'serif' | 'kai' | 'sans'
  fontSize: number
  lineHeight: number
  paragraphGap: number
  margin: number
  mode: 'page' | 'scroll'
  animation: 'none' | 'slide' | 'cover' | 'fade'
  autoPageSec: number
  autoScrollPx: number
  volumeKeys: boolean
  /** 阅读常亮分钟数，0 表示关闭 */
  keepAwake: number
  /** 朗读语速 */
  ttsRate: number
  /** 朗读跟随方式 */
  ttsFollow: 'page' | 'scroll' | 'none'
  /** 朗读引擎：系统 TTS 或本地神经音色 */
  ttsEngine: 'system' | 'local'
}

export interface BookmarkItem {
  id: string
  bookId: string
  chapterId: string
  chapterTitle: string
  anchor: ReadAnchor
  text: string
  createdAt: number
}

export interface StatsDay {
  date: string
  minutes: number
}

export interface StatsBook {
  minutes: number
  lastAt: number
}

export interface StatsSnapshot {
  days: StatsDay[]
  books: Record<string, StatsBook>
  totalMinutes: number
  streak: number
  todayMinutes: number
}
export type SuspiciousKind = 'short' | 'duplicate' | 'gap' | 'fallback'

export interface SuspiciousItem {
  chapterId: string
  title: string
  kind: SuspiciousKind
  detail: string
}