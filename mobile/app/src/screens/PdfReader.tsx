import { useEffect, useRef, useState } from 'react'
import type { BookMeta } from '../core/types'
import { openPdf, renderPdfPage, type PdfDocument } from '../core/pdf'
import { readBytes } from '../platform/storage'
import { pushBackHandler } from '../platform/back'
import { useLibrary } from '../store/library'

interface Props {
  book: BookMeta
  onBack: () => void
}

export function PdfReader({ book, onBack }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PdfDocument | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(book.pageCount || 1)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chrome, setChrome] = useState(true)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const bytes = await readBytes(`books/${book.id}/source.pdf`)
        if (!bytes) {
          setError('PDF 文件丢失')
          return
        }
        const doc = await openPdf(bytes)
        if (!alive) return
        docRef.current = doc
        setTotal(doc.numPages)
        const start = book.anchor && book.anchor.block > 0 ? Math.min(doc.numPages, book.anchor.block) : 1
        setPage(start)
        setReady(true)
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : String(issue))
      }
    })()
    return () => {
      alive = false
    }
  }, [book.id, book.anchor])

  useEffect(() => {
    if (!ready) return
    const doc = docRef.current
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!doc || !canvas || !stage) return
    const width = stage.clientWidth - 24
    void renderPdfPage(doc, { canvas, page, width, maxScale: 2 }).catch(() => undefined)
  }, [ready, page])

  useEffect(() => {
    void useLibrary.getState().update(book.id, {
      pageCount: total,
      progress: Math.round((page / Math.max(1, total)) * 100),
      anchor: { block: page, offset: 0 },
      lastReadAt: Date.now()
    })
  }, [book.id, page, total])

  useEffect(
    () =>
      pushBackHandler(() => {
        onBack()
        return true
      }),
    [onBack]
  )

  if (error) {
    return (
      <div className="screen loading">
        <span>{error}</span>
      </div>
    )
  }

  const turn = (delta: number): void => {
    setPage((current) => Math.max(1, Math.min(total, current + delta)))
  }

  return (
    <div className={`screen reader pdf-reader ${chrome ? 'chrome' : 'nochrome'}`}>
      <header className="rd-top">
        <button className="ghost" type="button" onClick={onBack}>
          ‹
        </button>
        <span className="chap">{book.title}</span>
        <span className="pdf-total">{total} 页</span>
      </header>

      <div
        className="pdf-stage"
        ref={stageRef}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = event.clientX - rect.left
          if (x < rect.width * 0.3) turn(-1)
          else if (x > rect.width * 0.7) turn(1)
          else setChrome((value) => !value)
        }}
      >
        <canvas ref={canvasRef} className="pdf-canvas" />
      </div>

      <footer className="rd-bottom">
        <span>
          {page}/{total}
        </span>
        <span>{Math.round((page / Math.max(1, total)) * 100)}%</span>
      </footer>
    </div>
  )
}
