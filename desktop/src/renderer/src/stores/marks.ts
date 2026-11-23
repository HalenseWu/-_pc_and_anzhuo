import { create } from 'zustand'
import type { Bookmark, Marks, Note, ReadAnchor } from '../../../shared/types'

interface MarksState {
  bookId: string | null
  bookmarks: Bookmark[]
  notes: Note[]
  load: (bookId: string) => Promise<void>
  addBookmark: (payload: {
    chapterId: string
    chapterTitle: string
    anchor: ReadAnchor
    excerpt: string
  }) => Promise<void>
  removeBookmark: (id: string) => Promise<void>
  addNote: (payload: {
    chapterId: string
    chapterTitle: string
    anchor: ReadAnchor
    quote: string
    text: string
  }) => Promise<void>
  removeNote: (id: string) => Promise<void>
}

function apply(marks: Marks): Pick<MarksState, 'bookmarks' | 'notes'> {
  return { bookmarks: marks.bookmarks ?? [], notes: marks.notes ?? [] }
}

export const useMarks = create<MarksState>((set, get) => ({
  bookId: null,
  bookmarks: [],
  notes: [],

  load: async (bookId) => {
    const api = window.wuya
    if (!api) return
    const marks = await api.marks.get(bookId)
    set({ bookId, ...apply(marks) })
  },

  addBookmark: async (payload) => {
    const { bookId } = get()
    const api = window.wuya
    if (!bookId || !api) return
    const marks = await api.marks.addBookmark(bookId, payload)
    set(apply(marks))
  },

  removeBookmark: async (id) => {
    const { bookId } = get()
    const api = window.wuya
    if (!bookId || !api) return
    const marks = await api.marks.removeBookmark(bookId, id)
    set(apply(marks))
  },

  addNote: async (payload) => {
    const { bookId } = get()
    const api = window.wuya
    if (!bookId || !api) return
    const marks = await api.marks.addNote(bookId, payload)
    set(apply(marks))
  },

  removeNote: async (id) => {
    const { bookId } = get()
    const api = window.wuya
    if (!bookId || !api) return
    const marks = await api.marks.removeNote(bookId, id)
    set(apply(marks))
  }
}))
