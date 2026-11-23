import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type {
  BookMeta,
  ChapterNode,
  ImportProgress,
  Marks,
  ReadAnchor,
  ReadChapter,
  SearchHit,
  TtsConfig
} from '../shared/types'
import { importBookFile } from './library/importer'
import { StatsStore } from './library/stats'
import { TtsManager } from './tts'
import { defaultBackupName, exportBackup, importBackup } from './backup'
import type { LibraryStore } from './library/store'

let contentCache: { id: string; text: string } | null = null

function loadContent(store: LibraryStore, id: string): string {
  if (contentCache?.id === id) return contentCache.text
  const text = readFileSync(store.contentPath(id), 'utf-8')
  contentCache = { id, text }
  return text
}

function flatten(nodes: ChapterNode[]): ChapterNode[] {
  const out: ChapterNode[] = []
  for (const node of nodes) {
    if (node.children?.length) out.push(...node.children)
    else out.push(node)
  }
  return out
}

function volumeOf(toc: ChapterNode[], chapterId: string): string | null {
  for (const node of toc) {
    if (node.children?.some((child) => child.id === chapterId)) return node.title
  }
  return null
}

/** 把章节原文按行切成段落，同时记下每段相对本章开头的偏移 */
function splitParagraphs(raw: string, title: string): { paragraphs: string[]; starts: number[] } {
  const paragraphs: string[] = []
  const starts: number[] = []
  const norm = (value: string): string => value.replace(/\s+/g, '')

  let cursor = 0
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) {
      const leading = line.length - line.trimStart().length
      // 首行往往就是章节标题本身，跳过避免重复
      const duplicateTitle = paragraphs.length === 0 && norm(trimmed) === norm(title)
      if (!duplicateTitle) {
        paragraphs.push(trimmed)
        starts.push(cursor + leading)
      }
    }
    cursor += line.length + 1
  }
  return { paragraphs, starts }
}

function findChapter(chapters: ChapterNode[], offset: number): ChapterNode | null {
  let low = 0
  let high = chapters.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const node = chapters[mid]
    if (offset < node.start) high = mid - 1
    else if (offset >= node.end) low = mid + 1
    else return node
  }
  return null
}

export function registerIpc(store: LibraryStore, getWindow: () => BrowserWindow | null): void {
  const stats = new StatsStore(store.root)
  const tts = new TtsManager(store.root)
  app.on('will-quit', () => tts.dispose())
  ipcMain.handle('library:list', () => store.list())

  ipcMain.handle('library:get', (_event, id: string) => store.get(id) ?? null)

  ipcMain.handle('library:remove', (_event, id: string) => {
    store.remove(id)
    return store.list()
  })

  ipcMain.handle('import:pick', async () => {
    const win = getWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: '导入小说',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: '小说文件', extensions: ['txt', 'epub', 'pdf'] }]
        })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('import:run', async (_event, paths: string[]) => {
    const taskId = `t${Date.now()}`
    const win = getWindow()
    const emit = (progress: ImportProgress): void => {
      win?.webContents.send('import:progress', progress)
    }
    const results = []
    for (const filePath of paths) {
      results.push(await importBookFile({ store, emit, taskId }, filePath))
    }
    return { taskId, results, books: store.list() }
  })

  const effectiveToc = (id: string): ChapterNode[] => store.readTocOverride(id) ?? store.readToc(id)

  ipcMain.handle('read:toc', (_event, id: string) => effectiveToc(id))

  ipcMain.handle('read:chapter', (_event, id: string, chapterId: string): ReadChapter | null => {
    const book = store.get(id)
    if (!book) return null
    const toc = effectiveToc(id)
    const chapters = flatten(toc)
    const index = chapters.findIndex((chapter) => chapter.id === chapterId)
    if (index < 0) return null
    const node = chapters[index]
    const content = loadContent(store, id)
    const raw = content.slice(node.start, node.end)
    const { paragraphs, starts } = splitParagraphs(raw, node.title)

    return {
      id: node.id,
      title: node.title,
      volumeTitle: volumeOf(toc, node.id),
      index,
      total: chapters.length,
      paragraphs,
      starts
    }
  })

  ipcMain.handle(
    'read:progress',
    (
      _event,
      id: string,
      payload: { chapterId: string; percent: number; anchor?: ReadAnchor | null }
    ) => {
      const book = store.get(id)
      if (!book) return null
      const updated: BookMeta = {
        ...book,
        currentChapterId: payload.chapterId,
        progress: Math.max(0, Math.min(100, Math.round(payload.percent))),
        anchor: payload.anchor ?? null,
        lastReadAt: Date.now()
      }
      store.upsert(updated)
      return updated
    }
  )

  ipcMain.handle('text:slice', (_event, id: string, start: number, end: number): string => {
    const content = loadContent(store, id)
    return content.slice(Math.max(0, start), Math.min(content.length, end))
  })

  ipcMain.handle('toc:save', (_event, id: string, toc: ChapterNode[]) => {
    store.writeTocOverride(id, toc)
    const chapters = flatten(toc)
    const volumes = toc.filter((node) => node.children?.length).length
    const book = store.get(id)
    if (book) {
      store.upsert({ ...book, chapterCount: chapters.length, volumeCount: volumes })
    }
    return toc
  })

  ipcMain.handle('toc:reset', (_event, id: string) => {
    store.clearTocOverride(id)
    const toc = store.readToc(id)
    const chapters = flatten(toc)
    const book = store.get(id)
    if (book) {
      store.upsert({
        ...book,
        chapterCount: chapters.length,
        volumeCount: toc.filter((node) => node.children?.length).length
      })
    }
    return toc
  })

  ipcMain.handle('library:organize', (
    _event,
    id: string,
    patch: { group?: string | null; tags?: string[] }
  ) => {
    const book = store.get(id)
    if (!book) return null
    const updated = {
      ...book,
      group: patch.group !== undefined ? patch.group : book.group ?? null,
      tags: patch.tags !== undefined ? patch.tags : book.tags ?? []
    }
    store.upsert(updated)
    return updated
  })

  ipcMain.handle('marks:all', () =>
    store.list().map((book) => ({
      bookId: book.id,
      title: book.title,
      author: book.author,
      format: book.format,
      bookmarks: store.readMarks(book.id).bookmarks
    }))
  )

  ipcMain.handle('library:saveCover', (_event, id: string, dataUrl: string) => {
    const book = store.get(id)
    if (!book) return null
    const match = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/)
    if (!match) return null
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
    const name = store.writeCover(id, Buffer.from(match[2], 'base64'), ext)
    const updated = { ...book, coverImage: name }
    store.upsert(updated)
    return updated
  })

  ipcMain.handle('library:setPageCount', (_event, id: string, pages: number) => {
    const book = store.get(id)
    if (!book) return null
    const updated = { ...book, pageCount: pages }
    store.upsert(updated)
    return updated
  })

  ipcMain.handle('marks:get', (_event, id: string) => store.readMarks(id))

  ipcMain.handle(
    'marks:addBookmark',
    (
      _event,
      id: string,
      payload: { chapterId: string; chapterTitle: string; anchor: ReadAnchor; excerpt: string }
    ): Marks => {
      const marks = store.readMarks(id)
      marks.bookmarks.unshift({
        id: `bm_${Date.now().toString(36)}`,
        chapterId: payload.chapterId,
        chapterTitle: payload.chapterTitle,
        anchor: payload.anchor,
        excerpt: payload.excerpt.slice(0, 80),
        createdAt: Date.now()
      })
      store.writeMarks(id, marks)
      return marks
    }
  )

  ipcMain.handle('marks:removeBookmark', (_event, id: string, markId: string): Marks => {
    const marks = store.readMarks(id)
    marks.bookmarks = marks.bookmarks.filter((item) => item.id !== markId)
    store.writeMarks(id, marks)
    return marks
  })

  ipcMain.handle(
    'marks:addNote',
    (
      _event,
      id: string,
      payload: {
        chapterId: string
        chapterTitle: string
        anchor: ReadAnchor
        quote: string
        text: string
      }
    ): Marks => {
      const marks = store.readMarks(id)
      marks.notes.unshift({
        id: `nt_${Date.now().toString(36)}`,
        chapterId: payload.chapterId,
        chapterTitle: payload.chapterTitle,
        anchor: payload.anchor,
        quote: payload.quote.slice(0, 200),
        text: payload.text.slice(0, 2000),
        createdAt: Date.now()
      })
      store.writeMarks(id, marks)
      return marks
    }
  )

  ipcMain.handle('marks:removeNote', (_event, id: string, noteId: string): Marks => {
    const marks = store.readMarks(id)
    marks.notes = marks.notes.filter((item) => item.id !== noteId)
    store.writeMarks(id, marks)
    return marks
  })

  const findHits = (bookId: string, keyword: string, limit: number): SearchHit[] => {
    const book = store.get(bookId)
    if (!book || !keyword) return []
    const toc = store.readToc(bookId)
    const chapters = flatten(toc)
    const content = loadContent(store, bookId)
    const haystack = content.toLowerCase()
    const needle = keyword.toLowerCase()
    const hits: SearchHit[] = []
    let from = 0
    while (hits.length < limit) {
      const at = haystack.indexOf(needle, from)
      if (at < 0) break
      const chapter = findChapter(chapters, at)
      if (chapter) {
        const start = Math.max(chapter.start, at - 26)
        const end = Math.min(chapter.end, at + needle.length + 26)
        const strip = (value: string): string => value.replace(/\[\[img:[^\]]+\]\]/g, '')
        const excerpt = strip(content.slice(start, end)).replace(/\n+/g, ' ')
        const prefix = strip(content.slice(start, at)).replace(/\n+/g, ' ').length
        hits.push({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          offsetInChapter: at - chapter.start,
          excerpt,
          matchStart: prefix,
          matchLength: needle.length
        })
      }
      from = at + Math.max(1, needle.length)
    }
    return hits
  }

  ipcMain.handle('search:book', (_event, id: string, query: string): SearchHit[] =>
    findHits(id, query.trim(), 200)
  )

  ipcMain.handle('search:library', (_event, query: string) => {
    const keyword = query.trim()
    if (!keyword) return []
    const started = Date.now()
    const groups: {
      bookId: string
      title: string
      author: string
      format: string
      hits: SearchHit[]
    }[] = []
    let total = 0

    for (const book of store.list()) {
      if (total >= 60 || Date.now() - started > 1500) break
      const hits = findHits(book.id, keyword, Math.min(5, 60 - total))
      if (hits.length === 0) continue
      groups.push({ bookId: book.id, title: book.title, author: book.author, format: book.format, hits })
      total += hits.length
    }
    return groups
  })

  ipcMain.handle('backup:export', async () => {
    const win = getWindow()
    const result = win
      ? await dialog.showSaveDialog(win, {
          title: '导出无涯备份',
          defaultPath: defaultBackupName(),
          filters: [{ name: '无涯备份', extensions: ['wuya'] }]
        })
      : await dialog.showSaveDialog({ title: '导出无涯备份', defaultPath: defaultBackupName() })
    if (result.canceled || !result.filePath) return null
    const bytes = await exportBackup(store, stats, result.filePath)
    return { path: result.filePath, bytes }
  })

  ipcMain.handle('backup:import', async () => {
    const win = getWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: '导入无涯备份',
          properties: ['openFile'],
          filters: [{ name: '无涯备份', extensions: ['wuya', 'zip'] }]
        })
      : await dialog.showOpenDialog({ title: '导入无涯备份', properties: ['openFile'] })
    if (result.canceled || !result.filePaths[0]) return null
    const summary = await importBackup(store, result.filePaths[0])
    return summary
  })

  ipcMain.handle('tts:config:get', () => tts.getConfig())
  ipcMain.handle('tts:config:set', (_event, patch: Partial<TtsConfig>) => tts.setConfig(patch))
  ipcMain.handle('tts:status', () => tts.status())
  ipcMain.handle('tts:start', () => tts.start())
  ipcMain.handle('tts:stop', () => tts.stop())
  ipcMain.handle('tts:synthesize', async (_event, text: string, speed: number) =>
    tts.synthesize(text, speed)
  )
  ipcMain.handle('tts:voices', () => tts.listVoices())
  ipcMain.handle('tts:read-audio', (_event, path: string) => {
    const data = readFileSync(path)
    if (data.length > 24 * 1024 * 1024) throw new Error('音频文件过大')
    return new Uint8Array(data)
  })
  ipcMain.handle('tts:duration', (_event, path: string) => tts.audioDuration(path))
  ipcMain.handle('tts:audio-info', (_event, path: string) => tts.audioInfo(path))
  ipcMain.handle('tts:suggest-ref', () => tts.suggestRef())
  ipcMain.handle('tts:pick', async (_event, kind: 'root' | 'gpt' | 'sovits' | 'ref') => {
    const win = getWindow()
    const filters =
      kind === 'ref'
        ? [{ name: '音频', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg'] }]
        : kind === 'gpt'
          ? [{ name: 'GPT 权重', extensions: ['ckpt'] }]
          : kind === 'sovits'
            ? [{ name: 'SoVITS 权重', extensions: ['pth'] }]
            : [{ name: 'Python', extensions: ['exe'] }]
    const options = {
      properties: (kind === 'root' ? ['openDirectory'] : ['openFile']) as Array<
        'openDirectory' | 'openFile'
      >,
      filters
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('stats:add', (
    _event,
    bookId: string,
    title: string,
    seconds: number,
    chars: number
  ) => {
    stats.add(bookId, title, seconds, chars)
    return true
  })

  ipcMain.handle('stats:get', () => stats.snapshot())

  ipcMain.handle('stats:export', async (_event, html: string, defaultName: string) => {
    let target = process.env.WUYA_EXPORT_PATH ?? ''
    if (!target) {
      const win = getWindow()
      const result = win
        ? await dialog.showSaveDialog(win, {
            title: '导出阅读周报',
            defaultPath: defaultName,
            filters: [
              { name: 'HTML 网页', extensions: ['html'] },
              { name: 'PDF 文档', extensions: ['pdf'] }
            ]
          })
        : await dialog.showSaveDialog({
            title: '导出阅读周报',
            defaultPath: defaultName,
            filters: [
              { name: 'HTML 网页', extensions: ['html'] },
              { name: 'PDF 文档', extensions: ['pdf'] }
            ]
          })
      if (result.canceled || !result.filePath) return null
      target = result.filePath
    }

    if (target.toLowerCase().endsWith('.pdf')) {
      const temp = join(tmpdir(), `wuya-report-${Date.now()}.html`)
      writeFileSync(temp, html, 'utf-8')
      const win = new BrowserWindow({ show: false, width: 820, height: 1160 })
      try {
        await win.loadFile(temp)
        const buffer = await win.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          pageSize: 'A4'
        })
        writeFileSync(target, buffer)
      } finally {
        win.destroy()
        rmSync(temp, { force: true })
      }
    } else {
      writeFileSync(target, html, 'utf-8')
    }
    return target
  })

  ipcMain.handle('app:data-dir', () => store.root)
  ipcMain.handle('app:open-data-dir', async () => {
    await shell.openPath(store.root)
    return true
  })
}
