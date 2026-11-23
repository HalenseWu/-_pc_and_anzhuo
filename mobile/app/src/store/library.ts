import { create } from 'zustand'
import { flattenChapters, makeBookMeta, parseTxt, sha1, sliceChapter } from '../core/importer'
import { parseEpub } from '../core/epub'
import { openPdf } from '../core/pdf'
import type { BookMeta, ChapterNode, LibraryIndex } from '../core/types'
import { readJson, readText, remove, removeDir, writeBytes, writeJson, writeText } from '../platform/storage'

const INDEX = 'library.json'

interface LibraryState {
  books: BookMeta[]
  ready: boolean
  importing: boolean
  importProgress: { done: number; total: number } | null
  error: string | null
  load: () => Promise<void>
  importFile: (file: File) => Promise<BookMeta | null>
  importMany: (files: File[]) => Promise<number>
  update: (id: string, patch: Partial<BookMeta>) => Promise<void>
  removeBook: (id: string) => Promise<void>
}

async function saveIndex(books: BookMeta[]): Promise<void> {
  const index: LibraryIndex = { version: 1, books }
  await writeJson(INDEX, index)
}

export const useLibrary = create<LibraryState>((set, get) => ({
  books: [],
  ready: false,
  importing: false,
  importProgress: null,
  error: null,

  load: async () => {
    const index = await readJson<LibraryIndex>(INDEX)
    set({ books: index?.books ?? [], ready: true })
  },

  importFile: async (file) => {
    if (get().importing) return null
    const lower = file.name.toLowerCase()
    const isTxt = lower.endsWith('.txt') || file.type.startsWith('text/')
    const isEpub = lower.endsWith('.epub')
    const isPdf = lower.endsWith('.pdf')
    if (!isTxt && !isEpub && !isPdf) {
      set({ error: '暂不支持这个格式（目前支持 TXT / EPUB / PDF）' })
      return null
    }
    set({ importing: true, error: null })
    try {
      const buffer = await file.arrayBuffer()
      const hash = await sha1(buffer)
      const id = `b_${hash.slice(0, 10)}`
      if (get().books.some((book) => book.id === id)) {
        set({ importing: false, error: '这本书已经在书架里了' })
        return null
      }

      if (isPdf) {
        const bytes = new Uint8Array(buffer)
        const doc = await openPdf(bytes.slice())
        const book = makeBookMeta(file.name, file.size, {
          content: '',
          tocs: [],
          chapters: [],
          encoding: 'PDF',
          volumeCount: 0,
          chapterCount: 0
        }, hash)
        book.format = 'PDF'
        book.pageCount = doc.numPages
        book.title = book.title.replace(/\.pdf$/i, '')
        await writeBytes(`books/${id}/source.pdf`, new Uint8Array(buffer))
        await writeJson(`books/${id}/meta.json`, book)
        const books = [book, ...get().books]
        await saveIndex(books)
        set({ books, importing: false })
        return book
      }

      const tocItems = isEpub ? (await parseEpub(buffer)) : null
      const parsed = tocItems
        ? {
            content: tocItems.content,
            tocs: tocItems.tocs,
            chapters: tocItems.chapters,
            encoding: 'UTF-8',
            volumeCount: 1,
            chapterCount: tocItems.chapters.length
          }
        : parseTxt(buffer)

      if (parsed.chapters.length === 0) {
        set({ importing: false, error: '没有识别到章节，文件可能是空的' })
        return null
      }

      const book = makeBookMeta(file.name, file.size, parsed, hash)
      if (tocItems) {
        book.format = 'EPUB'
        if (tocItems.title) book.title = tocItems.title
        if (tocItems.author) book.author = tocItems.author
        book.coverImage = tocItems.cover
      }
      await writeText(`books/${id}/content.txt`, parsed.content)
      await writeJson(`books/${id}/toc.json`, parsed.tocs)
      await writeJson(`books/${id}/meta.json`, book)
      const books = [book, ...get().books]
      await saveIndex(books)
      set({ books, importing: false })
      return book
    } catch (error) {
      set({ importing: false, error: error instanceof Error ? error.message : String(error) })
      return null
    }
  },

  importMany: async (files) => {
    const list = files.filter(
      (file) => /\.(txt|epub)$/i.test(file.name) || file.type.startsWith('text/')
    )
    if (list.length === 0) {
      set({ error: '请选择 .txt 或 .epub 文件' })
      return 0
    }
    let added = 0
    for (let index = 0; index < list.length; index += 1) {
      set({ importProgress: { done: index, total: list.length } })
      const book = await get().importFile(list[index])
      if (book) added += 1
    }
    set({ importProgress: null })
    return added
  },

  update: async (id, patch) => {
    const books = get().books.map((book) =>
      book.id === id ? { ...book, ...patch, updatedAt: Date.now() } : book
    )
    set({ books })
    await saveIndex(books)
    const current = books.find((book) => book.id === id)
    if (current) await writeJson(`books/${id}/meta.json`, current)
  },

  removeBook: async (id) => {
    const books = get().books.filter((book) => book.id !== id)
    set({ books })
    await saveIndex(books)
    await remove(`books/${id}/meta.json`)
    await removeDir(`books/${id}`)
  }
}))

export interface ChapterContent {
  id: string
  title: string
  volumeTitle: string | null
  index: number
  paragraphs: string[]
  chars: number
}

const contentCache = new Map<string, string>()

/** 整本书只读一次，后续切章直接切片（安卓上读 10MB 文件很慢） */
export async function loadContent(bookId: string): Promise<string | null> {
  const hit = contentCache.get(bookId)
  if (hit !== undefined) return hit
  const text = await readText(`books/${bookId}/content.txt`)
  if (text !== null) contentCache.set(bookId, text)
  return text
}

export interface SearchHit {
  chapterId: string
  chapterTitle: string
  chapterIndex: number
  block: number
  snippet: string
}

export async function searchBook(
  bookId: string,
  chapters: ChapterNode[],
  query: string,
  limit = 120
): Promise<SearchHit[]> {
  const keyword = query.trim()
  if (!keyword) return []
  const content = await loadContent(bookId)
  if (content === null) return []
  const hits: SearchHit[] = []
  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index]
    const text = content.slice(chapter.start, chapter.end)
    let from = 0
    while (hits.length < limit) {
      const found = text.indexOf(keyword, from)
      if (found < 0) break
      const before = text.slice(0, found).split(/\n+/)
      const block = Math.max(0, before.length - 2)
      const start = Math.max(0, found - 18)
      const snippet = text
        .slice(start, Math.min(text.length, found + keyword.length + 28))
        .replace(/\s+/g, ' ')
        .trim()
      hits.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterIndex: index,
        block,
        snippet
      })
      from = found + keyword.length
    }
    if (hits.length >= limit) break
  }
  return hits
}

export async function loadToc(bookId: string): Promise<ChapterNode[]> {
  const toc = await readJson<ChapterNode[]>(`books/${bookId}/toc.json`)
  if (!toc) return []
  /* toc.json 里是「卷 → 章」的层级，阅读时统一展平成章列表 */
  return flattenChapters(toc)
}

export async function saveToc(bookId: string, nodes: ChapterNode[]): Promise<void> {
  await writeJson(`books/${bookId}/toc.json`, nodes)
  const book = useLibrary.getState().books.find((item) => item.id === bookId)
  if (!book) return
  await useLibrary.getState().update(bookId, {
    chapterCount: nodes.length,
    volumeCount: nodes.length > 0 ? 1 : 0,
    currentChapterId: book.currentChapterId && nodes.some((node) => node.id === book.currentChapterId)
      ? book.currentChapterId
      : nodes[0]?.id ?? null
  })
}

export async function loadChapter(book: BookMeta, chapter: ChapterNode, index: number): Promise<ChapterContent | null> {
  const content = await loadContent(book.id)
  if (content === null) return null
  const { paragraphs, chars } = sliceChapter(content, chapter)
  return {
    id: chapter.id,
    title: chapter.title,
    volumeTitle: null,
    index,
    paragraphs,
    chars
  }
}
