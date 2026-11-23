import { create } from 'zustand'
import type { BookMeta, ImportProgress, LibrarySearchGroup } from '../../../shared/types'

interface LibraryState {
  books: BookMeta[]
  loaded: boolean
  busy: boolean
  progress: ImportProgress | null
  notice: string | null
  view: 'all' | 'recent' | 'reading' | 'unread' | 'done'
  groupFilter: string | null
  tagFilter: string | null
  setGroupFilter: (value: string | null) => void
  setTagFilter: (value: string | null) => void
  organizing: BookMeta | null
  setOrganizing: (book: BookMeta | null) => void
  bookmarksOpen: boolean
  setBookmarksOpen: (open: boolean) => void
  organize: (id: string, patch: { group?: string | null; tags?: string[] }) => Promise<void>
  setView: (view: 'all' | 'recent' | 'reading' | 'unread' | 'done') => void
  statsOpen: boolean
  setStatsOpen: (open: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  filter: string
  setFilter: (value: string) => void
  searchOpen: boolean
  searchQuery: string
  searchGroups: LibrarySearchGroup[]
  searching: boolean
  runLibrarySearch: (query: string) => Promise<void>
  closeSearch: () => void
  load: () => Promise<void>
  importPaths: (paths: string[]) => Promise<void>
  pickAndImport: () => Promise<void>
  remove: (id: string) => Promise<void>
  setNotice: (notice: string | null) => void
}

export const useLibrary = create<LibraryState>((set, get) => ({
  books: [],
  loaded: false,
  busy: false,
  progress: null,
  notice: null,
  view: 'all',
  setView: (view) => set({ view }),
  groupFilter: null,
  tagFilter: null,
  setGroupFilter: (value) => set({ groupFilter: value }),
  setTagFilter: (value) => set({ tagFilter: value }),
  organizing: null,
  setOrganizing: (book) => set({ organizing: book }),
  bookmarksOpen: false,
  setBookmarksOpen: (open) => set({ bookmarksOpen: open }),
  organize: async (id, patch) => {
    const updated = await window.wuya?.library.organize(id, patch)
    if (!updated) return
    set((state) => ({
      books: state.books.map((book) => (book.id === id ? updated : book)),
      organizing: null
    }))
  },
  statsOpen: false,
  setStatsOpen: (open) => set({ statsOpen: open }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  filter: '',
  setFilter: (value) => set({ filter: value }),
  searchOpen: false,
  searchQuery: '',
  searchGroups: [],
  searching: false,
  closeSearch: () => set({ searchOpen: false }),
  runLibrarySearch: async (query) => {
    const keyword = query.trim()
    if (!keyword) return
    set({ searchOpen: true, searchQuery: keyword, searching: true, searchGroups: [] })
    const groups = (await window.wuya?.search.library(keyword)) ?? []
    set({ searchGroups: groups, searching: false })
  },

  load: async () => {
    const books = (await window.wuya?.library.list()) ?? []
    set({ books, loaded: true })
  },

  importPaths: async (paths) => {
    if (!paths.length || get().busy) return
    const api = window.wuya
    if (!api) return
    set({ busy: true, progress: null })
    try {
      const result = await api.importer.run(paths)
      set({ books: result.books })
      const skipped = result.results.filter((item) => item.skipped === 'duplicate').length
      const failed = result.results.filter((item) => !item.ok)
      if (skipped > 0) set({ notice: `${skipped} 本已在书架中，已跳过` })
      if (failed.length > 0) set({ notice: `导入失败：${failed[0].error ?? '未知错误'}` })
    } catch (error) {
      set({ notice: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ busy: false })
      setTimeout(() => {
        if (!useLibrary.getState().busy) useLibrary.setState({ progress: null })
      }, 900)
    }
  },

  pickAndImport: async () => {
    const paths = (await window.wuya?.importer.pick()) ?? []
    if (paths.length) await get().importPaths(paths)
  },

  remove: async (id) => {
    const books = (await window.wuya?.library.remove(id)) ?? []
    set({ books })
  },

  setNotice: (notice) => set({ notice })
}))

export function subscribeImportProgress(): () => void {
  const api = window.wuya
  if (!api) return () => {}
  return api.importer.onProgress((progress) => {
    useLibrary.setState({ progress })
  })
}
