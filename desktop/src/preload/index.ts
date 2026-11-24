import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  BookMeta,
  Bookmark,
  ChapterNode,
  ImportProgress,
  ImportResult,
  LibraryIndex,
  Marks,
  Note,
  ReadAnchor,
  ReadChapter,
  SearchHit,
  LibrarySearchGroup,
  StatsSnapshot,
  TtsConfig,
  TtsStatus
} from '../shared/types'

export interface ImportRunResult {
  taskId: string
  results: ImportResult[]
  books: BookMeta[]
}

const api = {
  win: {
    minimize: (): void => ipcRenderer.send('win:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('win:toggle-maximize'),
    close: (): void => ipcRenderer.send('win:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('win:is-maximized'),
    onMaximized: (cb: (value: boolean) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, value: boolean): void => cb(value)
      ipcRenderer.on('win:maximized', handler)
      return () => ipcRenderer.off('win:maximized', handler)
    }
  },
  library: {
    list: (): Promise<BookMeta[]> => ipcRenderer.invoke('library:list'),
    get: (id: string): Promise<BookMeta | null> => ipcRenderer.invoke('library:get', id),
    remove: (id: string): Promise<BookMeta[]> => ipcRenderer.invoke('library:remove', id),
    rename: (id: string, patch: { title?: string; author?: string }): Promise<BookMeta | null> =>
      ipcRenderer.invoke('library:rename', id, patch),
    reload: (id: string): Promise<{ ok: boolean; book?: BookMeta; error?: string }> =>
      ipcRenderer.invoke('library:reload', id),
    dataDir: (): Promise<string> => ipcRenderer.invoke('app:data-dir'),
    openDataDir: (): Promise<boolean> => ipcRenderer.invoke('app:open-data-dir'),
    organize: (id: string, patch: { group?: string | null; tags?: string[] }): Promise<BookMeta | null> =>
      ipcRenderer.invoke('library:organize', id, patch),
    saveCover: (id: string, dataUrl: string): Promise<BookMeta | null> =>
      ipcRenderer.invoke('library:saveCover', id, dataUrl),
    setPageCount: (id: string, pages: number): Promise<BookMeta | null> =>
      ipcRenderer.invoke('library:setPageCount', id, pages)
  },
  importer: {
    pick: (): Promise<string[]> => ipcRenderer.invoke('import:pick'),
    run: (paths: string[]): Promise<ImportRunResult> => ipcRenderer.invoke('import:run', paths),
    onProgress: (cb: (progress: ImportProgress) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, progress: ImportProgress): void => cb(progress)
      ipcRenderer.on('import:progress', handler)
      return () => ipcRenderer.off('import:progress', handler)
    }
  },
  backup: {
    export: (): Promise<{ path: string; bytes: number } | null> => ipcRenderer.invoke('backup:export'),
    import: (): Promise<{ added: number; skipped: number; total: number } | null> =>
      ipcRenderer.invoke('backup:import')
  },
  tts: {
    config: {
      get: (): Promise<TtsConfig> => ipcRenderer.invoke('tts:config:get'),
      set: (patch: Partial<TtsConfig>): Promise<TtsConfig> =>
        ipcRenderer.invoke('tts:config:set', patch)
    },
    status: (): Promise<TtsStatus> => ipcRenderer.invoke('tts:status'),
    start: (): Promise<TtsStatus> => ipcRenderer.invoke('tts:start'),
    stop: (): Promise<TtsStatus> => ipcRenderer.invoke('tts:stop'),
    synthesize: (text: string, speed: number): Promise<Uint8Array> =>
      ipcRenderer.invoke('tts:synthesize', text, speed),
    voices: (): Promise<string[]> => ipcRenderer.invoke('tts:voices'),
    readAudio: (path: string): Promise<Uint8Array> => ipcRenderer.invoke('tts:read-audio', path),
    duration: (path: string): Promise<number | null> => ipcRenderer.invoke('tts:duration', path),
    audioInfo: (path: string): Promise<{ duration: number | null; brightness: number | null }> =>
      ipcRenderer.invoke('tts:audio-info', path),
    suggestRef: (): Promise<string | null> => ipcRenderer.invoke('tts:suggest-ref'),
    pick: (kind: 'root' | 'gpt' | 'sovits' | 'ref'): Promise<string | null> =>
      ipcRenderer.invoke('tts:pick', kind)
  },
  stats: {
    add: (bookId: string, title: string, seconds: number, chars: number): Promise<boolean> =>
      ipcRenderer.invoke('stats:add', bookId, title, seconds, chars),
    get: (): Promise<StatsSnapshot> => ipcRenderer.invoke('stats:get'),
    exportReport: (html: string, defaultName: string): Promise<string | null> =>
      ipcRenderer.invoke('stats:export', html, defaultName)
  },
  toc: {
    get: (id: string): Promise<ChapterNode[]> => ipcRenderer.invoke('read:toc', id),
    save: (id: string, toc: ChapterNode[]): Promise<ChapterNode[]> =>
      ipcRenderer.invoke('toc:save', id, toc),
    reset: (id: string): Promise<ChapterNode[]> => ipcRenderer.invoke('toc:reset', id),
    slice: (id: string, start: number, end: number): Promise<string> =>
      ipcRenderer.invoke('text:slice', id, start, end)
  },
  reader: {
    toc: (id: string): Promise<ChapterNode[]> => ipcRenderer.invoke('read:toc', id),
    chapter: (id: string, chapterId: string): Promise<ReadChapter | null> =>
      ipcRenderer.invoke('read:chapter', id, chapterId),
    saveProgress: (
      id: string,
      payload: { chapterId: string; percent: number; anchor?: ReadAnchor | null }
    ): Promise<BookMeta | null> => ipcRenderer.invoke('read:progress', id, payload)
  },
  marks: {
    all: (): Promise<
      { bookId: string; title: string; author: string; format: string; bookmarks: Bookmark[] }[]
    > => ipcRenderer.invoke('marks:all'),
    get: (id: string): Promise<Marks> => ipcRenderer.invoke('marks:get', id),
    addBookmark: (
      id: string,
      payload: { chapterId: string; chapterTitle: string; anchor: ReadAnchor; excerpt: string }
    ): Promise<Marks> => ipcRenderer.invoke('marks:addBookmark', id, payload),
    removeBookmark: (id: string, markId: string): Promise<Marks> =>
      ipcRenderer.invoke('marks:removeBookmark', id, markId),
    addNote: (id: string, payload: NoteInput): Promise<Marks> =>
      ipcRenderer.invoke('marks:addNote', id, payload),
    removeNote: (id: string, noteId: string): Promise<Marks> =>
      ipcRenderer.invoke('marks:removeNote', id, noteId)
  },
  search: {
    book: (id: string, query: string): Promise<SearchHit[]> =>
      ipcRenderer.invoke('search:book', id, query),
    library: (query: string): Promise<LibrarySearchGroup[]> =>
      ipcRenderer.invoke('search:library', query)
  },
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type WuyaApi = typeof api
export type { LibraryIndex }

export interface NoteInput {
  chapterId: string
  chapterTitle: string
  anchor: ReadAnchor
  quote: string
  text: string
}

export type { Bookmark, Note }

contextBridge.exposeInMainWorld('wuya', api)
