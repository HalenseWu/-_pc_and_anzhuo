import { useCallback, useEffect, useRef, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Shelf } from './screens/Shelf'
import { Reader } from './screens/Reader'
import { PdfReader } from './screens/PdfReader'
import { TocEditor } from './screens/TocEditor'
import { useEditor } from './stores/editor'
import { SearchOverlay } from './components/SearchOverlay'
import { AppSettings } from './components/AppSettings'
import { Stats } from './screens/Stats'
import { AllBookmarks } from './screens/AllBookmarks'
import { OrganizeDialog } from './components/OrganizeDialog'
import { subscribeImportProgress, useLibrary } from './stores/library'
import { useReader } from './stores/reader'

const PHASE_TEXT: Record<string, string> = {
  hash: '读取文件',
  decode: '识别编码',
  clean: '整理排版',
  chapters: '识别章节',
  write: '写入书库',
  done: '完成',
  error: '失败'
}

function ImportToast(): React.JSX.Element | null {
  const progress = useLibrary((state) => state.progress)
  const notice = useLibrary((state) => state.notice)
  const setNotice = useLibrary((state) => state.setNotice)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3200)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  if (notice) {
    return (
      <div className="toast">
        <span className="toast-dot" />
        {notice}
      </div>
    )
  }
  if (!progress) return null

  return (
    <div className="toast importing">
      <div className="toast-row">
        <span>{progress.fileName}</span>
        <span className="toast-phase">
          {PHASE_TEXT[progress.phase] ?? progress.phase}
          {progress.message ? ` · ${progress.message}` : ''}
        </span>
      </div>
      <div className="toast-bar">
        <i style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  )
}

export function App(): React.JSX.Element {
  const load = useLibrary((state) => state.load)
  const importPaths = useLibrary((state) => state.importPaths)
  const readerOpen = useReader((state) => state.open)
  const readerBook = useReader((state) => state.book)
  const editorBook = useEditor((state) => state.book)
  const statsOpen = useLibrary((state) => state.statsOpen)
  const bookmarksOpen = useLibrary((state) => state.bookmarksOpen)
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    void (async () => {
      await load()
      const libSearch = new URLSearchParams(location.search).get('libsearch')
      if (libSearch) await useLibrary.getState().runLibrarySearch(libSearch)
      if (location.hash.startsWith('#stats')) useLibrary.getState().setStatsOpen(true)
      if (location.hash === '#bookmarks') useLibrary.getState().setBookmarksOpen(true)
      if (location.hash === '#editor') {
        const first = useLibrary.getState().books[0]
        if (first) useEditor.getState().open(first)
      }
      if (location.hash.startsWith('#reader')) {
        const first = useLibrary.getState().books[0]
        if (first) await useReader.getState().start(first)
      }
    })()
    return subscribeImportProgress()
  }, [load])

  const onDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    depth.current += 1
    if (event.dataTransfer.types.includes('Files')) setDragging(true)
  }, [])

  const onDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    depth.current -= 1
    if (depth.current <= 0) {
      depth.current = 0
      setDragging(false)
    }
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      depth.current = 0
      setDragging(false)
      const api = window.wuya
      if (!api) return
      const paths = Array.from(event.dataTransfer.files)
        .map((file) => api.pathForFile(file))
        .filter(Boolean)
      if (paths.length) void importPaths(paths)
    },
    [importPaths]
  )

  return (
    <>
      <SearchOverlay />
      <AppSettings />
      <OrganizeDialog />
      {bookmarksOpen ? (
        <AllBookmarks />
      ) : statsOpen ? (
        <Stats />
      ) : editorBook ? (
        <TocEditor />
      ) : readerOpen && readerBook?.format === 'PDF' ? (
        <PdfReader book={readerBook} />
      ) : readerOpen ? (
        <Reader />
      ) : (
        <div
          className="app"
          onDragEnter={onDragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <TitleBar />
          <div className="app-body">
            <Sidebar />
            <Shelf />
          </div>
          <ImportToast />
          {dragging ? (
            <div className="drop-mask">
              <div className="drop-card">
                <div className="drop-seal">涯</div>
                <div className="drop-title">松手导入</div>
                <div className="drop-sub">支持 TXT · 可多选</div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}
