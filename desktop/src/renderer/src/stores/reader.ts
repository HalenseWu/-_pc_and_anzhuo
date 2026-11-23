import { create } from 'zustand'
import type { BookMeta, ChapterNode, ReadAnchor, ReadChapter } from '../../../shared/types'

export type ThemeId = 'paper' | 'sepia' | 'green' | 'night' | 'black'
export type FontId = 'serif' | 'kai' | 'sans'
export type ReadingMode = 'page' | 'scroll'
export type PageAnim = 'slide' | 'cover' | 'fade' | 'none'

export interface ReaderSettings {
  mode: ReadingMode
  spread: boolean
  animation: PageAnim
  theme: ThemeId
  font: FontId
  fontSize: number
  lineHeight: number
  paragraphGap: number
  pageWidth: number
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  mode: 'page',
  spread: false,
  animation: 'slide',
  theme: 'paper',
  font: 'serif',
  fontSize: 20,
  lineHeight: 1.96,
  paragraphGap: 0.85,
  pageWidth: 720
}

const STORAGE_KEY = 'wuya.reader.settings'

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function flatten(nodes: ChapterNode[]): ChapterNode[] {
  const out: ChapterNode[] = []
  for (const node of nodes) {
    if (node.children?.length) out.push(...node.children)
    else out.push(node)
  }
  return out
}

interface ReaderState {
  open: boolean
  book: BookMeta | null
  toc: ChapterNode[]
  chapters: ChapterNode[]
  chapter: ReadChapter | null
  chapterIndex: number
  page: number
  pages: number
  pendingAnchor: ReadAnchor | null
  pendingEnd: boolean
  currentAnchor: { chapterId: string; anchor: ReadAnchor } | null
  highlight: { block: number; offset: number; length: number } | null
  settings: ReaderSettings
  start: (book: BookMeta) => Promise<void>
  exit: () => void
  loadChapter: (chapterId: string, anchor?: ReadAnchor | null, end?: boolean) => Promise<void>
  setPage: (page: number) => void
  setPages: (pages: number) => void
  consumeAnchor: () => void
  nextChapter: () => Promise<void>
  prevChapter: () => Promise<void>
  updateSettings: (patch: Partial<ReaderSettings>) => void
  goToOffset: (chapterId: string, offset: number, length?: number) => Promise<void>
  setCurrentAnchor: (value: { chapterId: string; anchor: ReadAnchor } | null) => void
}

export const useReader = create<ReaderState>((set, get) => ({
  open: false,
  book: null,
  toc: [],
  chapters: [],
  chapter: null,
  chapterIndex: 0,
  page: 0,
  pages: 1,
  pendingAnchor: null,
  pendingEnd: false,
  currentAnchor: null,
  highlight: null,
  settings: loadSettings(),

  start: async (book) => {
    const api = window.wuya
    if (!api) return
    if (book.format === 'PDF') {
      // PDF 由独立渲染器接管，不进章节体系
      set({ open: true, book, toc: [], chapters: [], chapter: null, chapterIndex: 0, page: 0, pages: 1 })
      return
    }
    const toc = await api.reader.toc(book.id)
    const chapters = flatten(toc)
    const wanted = book.currentChapterId
    const found = chapters.findIndex((item) => item.id === wanted)
    const chapterId = found >= 0 ? (wanted as string) : chapters[0]?.id
    set({
      open: true,
      book,
      toc,
      chapters,
      page: 0,
      pages: 1,
      chapter: null,
      chapterIndex: Math.max(0, found)
    })
    if (chapterId) await get().loadChapter(chapterId, found >= 0 ? book.anchor : null)
  },

  exit: () => {
    set({ open: false, book: null, chapter: null, toc: [], chapters: [] })
  },

  loadChapter: async (chapterId, anchor = null, end = false) => {
    const { book } = get()
    const api = window.wuya
    if (!book || !api) return
    const chapter = await api.reader.chapter(book.id, chapterId)
    if (!chapter) return
    set({
      chapter,
      chapterIndex: chapter.index,
      page: 0,
      pages: 1,
      // 没有指定锚点就是"从这章开头读"，必须显式回到第 0 段第 0 字，
      // 否则滚动模式会保留上一章的 scrollTop，看起来像跳到了章节中间。
      pendingAnchor: end ? null : (anchor ?? { block: 0, offset: 0 }),
      pendingEnd: end
    })
  },

  setPage: (page) => set({ page: Math.max(0, page) }),
  setPages: (pages) => set({ pages: Math.max(1, pages) }),
  consumeAnchor: () => set({ pendingAnchor: null, pendingEnd: false }),
  setCurrentAnchor: (value) => set({ currentAnchor: value }),

  goToOffset: async (chapterId, offset, length = 0) => {
    const { book } = get()
    const api = window.wuya
    if (!book || !api) return
    const chapter = await api.reader.chapter(book.id, chapterId)
    if (!chapter) return
    const starts = chapter.starts ?? []
    let block = 0
    for (let i = 0; i < starts.length; i += 1) {
      if (starts[i] <= offset) block = i
    }
    const anchor = { block, offset: Math.max(0, offset - (starts[block] ?? 0)) }
    set({
      chapter,
      chapterIndex: chapter.index,
      page: 0,
      pages: 1,
      pendingAnchor: anchor,
      pendingEnd: false,
      highlight: length > 0 ? { block, offset: anchor.offset, length } : null
    })
  },

  nextChapter: async () => {
    const { chapters, chapterIndex } = get()
    const next = chapters[chapterIndex + 1]
    if (next) await get().loadChapter(next.id)
  },

  prevChapter: async () => {
    const { chapters, chapterIndex } = get()
    const prev = chapters[chapterIndex - 1]
    if (prev) await get().loadChapter(prev.id, null, true)
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // 存储不可用时仅保留内存态
    }
  }
}))
