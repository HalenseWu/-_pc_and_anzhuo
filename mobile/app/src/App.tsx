import { useEffect, useState } from 'react'
import { LibraryScreen, ReaderScreen } from './screens/Screens'
import { useLibrary } from './store/library'
import { exitApp, initBackButton, minimizeApp } from './platform/back'

export function App(): React.JSX.Element {
  const [bookId, setBookId] = useState<string | null>(null)
  const [askExit, setAskExit] = useState(() => new URLSearchParams(location.search).has('exit'))
  const books = useLibrary((state) => state.books)

  useEffect(() => initBackButton(), [])

  useEffect(() => {
    if (!new URLSearchParams(location.search).has('open')) return
    if (!books.length) return
    setBookId((current) => current ?? books[0].id)
  }, [books])

  return (
    <>
      {bookId ? (
        <ReaderScreen bookId={bookId} onBack={() => setBookId(null)} />
      ) : (
        <LibraryScreen onOpen={setBookId} onAskExit={() => setAskExit(true)} />
      )}

      {askExit ? (
        <div className="dialog-scrim" onClick={() => setAskExit(false)}>
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
            <h3>要退出无涯吗？</h3>
            <p>退出并关闭会结束应用；仅退出会把应用放到后台，下次打开还能直接接着看。</p>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setAskExit(false)}>
                取消
              </button>
              <button type="button" onClick={() => { setAskExit(false); minimizeApp() }}>
                仅退出
              </button>
              <button type="button" className="danger" onClick={() => exitApp()}>
                退出并关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
