import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  quote: string
  onCancel: () => void
  onSave: (body: string) => void
}

export function NoteEditor({ open, quote, onCancel, onSave }: Props): React.JSX.Element | null {
  const [body, setBody] = useState('')

  useEffect(() => {
    if (open) setBody('')
  }, [open])

  if (!open) return null

  return (
    <div className="dialog-scrim" onClick={onCancel}>
      <div className="dialog note-dialog" onClick={(event) => event.stopPropagation()}>
        <h3>写笔记</h3>
        {quote ? <p className="note-src">“{quote}”</p> : null}
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="记点什么…"
          rows={5}
          autoFocus
        />
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={!body.trim()}
            onClick={() => onSave(body.trim())}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
