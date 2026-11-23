import { create } from 'zustand'
import type { BookMeta } from '../../../shared/types'

interface EditorState {
  book: BookMeta | null
  open: (book: BookMeta) => void
  close: () => void
}

export const useEditor = create<EditorState>((set) => ({
  book: null,
  open: (book) => set({ book }),
  close: () => set({ book: null })
}))
