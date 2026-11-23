import { create } from 'zustand'
import { readJson, writeJson } from '../platform/storage'

export interface Bookmark {
  id: string
  chapterId: string
  chapterTitle: string
  block: number
  text: string
  createdAt: number
}

export interface Note {
  id: string
  chapterId: string
  chapterTitle: string
  block: number
  quote: string
  body: string
  createdAt: number
}

const EMPTY: Bookmark[] = []
const EMPTY_NOTES: Note[] = []

interface MarksState {
  byBook: Record<string, Bookmark[]>
  notesByBook: Record<string, Note[]>
  load: (bookId: string) => Promise<void>
  add: (bookId: string, item: Omit<Bookmark, 'id' | 'createdAt'>) => Promise<boolean>
  remove: (bookId: string, id: string) => Promise<void>
  find: (bookId: string, chapterId: string, block: number) => Bookmark | undefined
  addNote: (bookId: string, item: Omit<Note, 'id' | 'createdAt'>) => Promise<void>
  removeNote: (bookId: string, id: string) => Promise<void>
}

async function persist(bookId: string, list: Bookmark[]): Promise<void> {
  await writeJson(`books/${bookId}/marks.json`, list)
}

async function persistNotes(bookId: string, list: Note[]): Promise<void> {
  await writeJson(`books/${bookId}/notes.json`, list)
}

export const useMarks = create<MarksState>((set, get) => ({
  byBook: {},
  notesByBook: {},

  load: async (bookId) => {
    const [list, notes] = await Promise.all([
      readJson<Bookmark[]>(`books/${bookId}/marks.json`),
      readJson<Note[]>(`books/${bookId}/notes.json`)
    ])
    set({
      byBook: { ...get().byBook, [bookId]: list ?? EMPTY },
      notesByBook: { ...get().notesByBook, [bookId]: notes ?? EMPTY_NOTES }
    })
  },

  add: async (bookId, item) => {
    const list = get().byBook[bookId] ?? EMPTY
    const exists = list.some(
      (mark) => mark.chapterId === item.chapterId && Math.abs(mark.block - item.block) <= 2
    )
    if (exists) return false
    const next: Bookmark[] = [
      { ...item, id: `m_${Date.now()}_${Math.floor(Math.random() * 1000)}`, createdAt: Date.now() },
      ...list
    ]
    set({ byBook: { ...get().byBook, [bookId]: next } })
    await persist(bookId, next)
    return true
  },

  remove: async (bookId, id) => {
    const next = (get().byBook[bookId] ?? EMPTY).filter((mark) => mark.id !== id)
    set({ byBook: { ...get().byBook, [bookId]: next } })
    await persist(bookId, next)
  },

  find: (bookId, chapterId, block) =>
    (get().byBook[bookId] ?? EMPTY).find(
      (mark) => mark.chapterId === chapterId && Math.abs(mark.block - block) <= 2
    ),

  addNote: async (bookId, item) => {
    const list = get().notesByBook[bookId] ?? EMPTY_NOTES
    const next: Note[] = [
      { ...item, id: `n_${Date.now()}_${Math.floor(Math.random() * 1000)}`, createdAt: Date.now() },
      ...list
    ]
    set({ notesByBook: { ...get().notesByBook, [bookId]: next } })
    await persistNotes(bookId, next)
  },

  removeNote: async (bookId, id) => {
    const next = (get().notesByBook[bookId] ?? EMPTY_NOTES).filter((note) => note.id !== id)
    set({ notesByBook: { ...get().notesByBook, [bookId]: next } })
    await persistNotes(bookId, next)
  }
}))

export function selectMarks(bookId: string | null, state: MarksState): Bookmark[] {
  return bookId ? state.byBook[bookId] ?? EMPTY : EMPTY
}

export function selectNotes(bookId: string | null, state: MarksState): Note[] {
  return bookId ? state.notesByBook[bookId] ?? EMPTY_NOTES : EMPTY_NOTES
}
