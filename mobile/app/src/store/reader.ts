import { create } from 'zustand'
import type { BookMeta, ChapterNode, ReadAnchor, ReaderSettings } from '../core/types'
import { loadChapter, loadToc, type ChapterContent } from './library'
import { useLibrary } from './library'

export const THEMES: { id: ReaderSettings['theme']; label: string; paper: string; text: string }[] = [
  { id: 'paper', label: '纸白', paper: '#F7F3EA', text: '#2B2620' },
  { id: 'sepia', label: '米黄', paper: '#F1E3C8', text: '#3A2E1F' },
  { id: 'green', label: '护眼', paper: '#DCE8D5', text: '#22301F' },
  { id: 'night', label: '夜间', paper: '#1B1E23', text: '#B9BEC6' },
  { id: 'black', label: '纯黑', paper: '#000000', text: '#9AA0A6' }
]

export const FONTS: { id: ReaderSettings['fontId']; label: string; family: string }[] = [
  { id: 'serif', label: '宋体', family: "'Wuya Serif', 'Songti SC', serif" },
  { id: 'kai', label: '楷体', family: "'Wuya Kai', 'Kaiti SC', serif" },
  { id: 'sans', label: '黑体', family: "system-ui, -apple-system, 'PingFang SC', sans-serif" }
]

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'paper',
  fontId: 'serif',
  fontSize: 19,
  lineHeight: 1.9,
  paragraphGap: 0.9,
  margin: 20,
  mode: 'page',
  animation: 'slide',
  autoPageSec: 12,
  autoScrollPx: 46,
  volumeKeys: true,
  keepAwake: 5,
  ttsRate: 1,
  ttsFollow: 'page',
  ttsEngine: 'system'
}

const SETTINGS_KEY = 'wuya:settings:reader'

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface ReaderState {
  settings: ReaderSettings
  book: BookMeta | null
  chapters: ChapterNode[]
  chapter: ChapterContent | null
  page: number
  pages: number
  anchor: ReadAnchor | null
  gotoEnd: boolean
  updateSettings: (patch: Partial<ReaderSettings>) => void
  open: (bookId: string) => Promise<void>
  goChapter: (index: number, anchor?: ReadAnchor | null, gotoEnd?: boolean) => Promise<void>
  clearGotoEnd: () => void
  setPage: (page: number) => void
  setPages: (pages: number) => void
  savePosition: (chapterId: string, block: number, ratio: number, page?: number) => void
}

let openSeq = 0

export const useReader = create<ReaderState>((set, get) => ({
  settings: loadSettings(),
  book: null,
  chapters: [],
  chapter: null,
  page: 0,
  pages: 1,
  anchor: null,
  gotoEnd: false,

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  },

  open: async (bookId) => {
    const seq = (openSeq += 1)
    const book = useLibrary.getState().books.find((item) => item.id === bookId) ?? null
    if (!book) return
    const chapters = await loadToc(book.id)
    let index = chapters.findIndex((item) => item.id === book.currentChapterId)
    if (index < 0) index = 0
    const chapter = chapters[index] ? await loadChapter(book, chapters[index], index) : null
    /* 快速切换时，只认最后一次打开请求 */
    if (seq !== openSeq) return
    set({
      book,
      chapters,
      chapter,
      page: 0,
      pages: 1,
      anchor: book.anchor ?? null
    })
  },

  clearGotoEnd: () => set({ gotoEnd: false }),

  goChapter: async (index, anchor, gotoEnd) => {
    const seq = openSeq
    const { book, chapters } = get()
    if (!book || !chapters[index]) return
    const chapter = await loadChapter(book, chapters[index], index)
    if (seq !== openSeq) return
    set({ chapter, page: 0, pages: 1, anchor: anchor ?? null, gotoEnd: Boolean(gotoEnd) })
    void useLibrary.getState().update(book.id, {
      currentChapterId: chapters[index].id,
      anchor: anchor ?? { block: 0, offset: 0 }
    })
  },

  setPage: (page) => set({ page }),
  setPages: (pages) => set({ pages }),

  savePosition: (chapterId, block, ratio, page) => {
    const { book, chapters } = get()
    if (!book) return
    const index = chapters.findIndex((item) => item.id === chapterId)
    if (index < 0) return
    const overall = (index + Math.max(0, Math.min(1, ratio))) / Math.max(1, chapters.length)
    void useLibrary.getState().update(book.id, {
      currentChapterId: chapterId,
      progress: Math.max(0, Math.min(100, Math.round(overall * 100))),
      anchor: page === undefined ? { block, offset: 0 } : { block, offset: 0, page },
      lastReadAt: Date.now()
    })
  }
}))
