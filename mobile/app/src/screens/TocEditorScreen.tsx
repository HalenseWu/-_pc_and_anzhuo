import { useEffect, useState } from 'react'
import type { BookMeta, ChapterNode } from '../core/types'
import { isContiguous, mergeChapters, paragraphStarts, renameChapter, splitChapter } from '../core/toc-edit'
import { loadContent, loadToc, saveToc } from '../store/library'
import { pushBackHandler } from '../platform/back'

interface Props {
  book: BookMeta
  onClose: () => void
}

export function TocEditorScreen({ book, onClose }: Props): React.JSX.Element {
  const [nodes, setNodes] = useState<ChapterNode[]>([])
  const [content, setContent] = useState('')
  const [mergeMode, setMergeMode] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [actionIndex, setActionIndex] = useState<number | null>(null)
  const [target, setTarget] = useState<ChapterNode | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameText, setRenameText] = useState('')
  const [splitOpen, setSplitOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    void (async () => {
      setNodes(await loadToc(book.id))
      setContent((await loadContent(book.id)) ?? '')
    })()
  }, [book.id])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const save = async (close: boolean): Promise<void> => {
    if (dirty) {
      await saveToc(book.id, nodes)
      setDirty(false)
    }
    if (close) onClose()
  }

  useEffect(
    () =>
      pushBackHandler(() => {
        if (splitOpen) {
          setSplitOpen(false)
          return true
        }
        if (renameOpen) {
          setRenameOpen(false)
          return true
        }
        if (actionIndex !== null) {
          setActionIndex(null)
          return true
        }
        void save(true)
        return true
      }),
    [splitOpen, renameOpen, actionIndex, nodes, dirty]
  )

  const apply = (next: ChapterNode[]): void => {
    setNodes(next)
    setDirty(true)
    setSelected([])
  }

  const actionNode = actionIndex !== null ? nodes[actionIndex] : null

  const splitParagraphs = (() => {
    if (!target) return [] as { text: string; boundary: number }[]
    const raw = content.slice(target.start, target.end)
    /* 第一个分界点在标题与首段之间，拆出来会得到只有标题的空章，跳过 */
    return paragraphStarts(raw)
      .slice(1)
      .map((boundary) => ({
        boundary,
        text: raw.slice(boundary, boundary + 60).replace(/\s+/g, ' ').trim()
      }))
  })()

  return (
    <div className="screen toc-editor">
      <header className="lib-head">
        <button className="icon-btn" type="button" onClick={() => void save(true)}>
          ‹
        </button>
        <h1>目录编辑</h1>
        <button
          className={`ed-btn ${mergeMode ? 'on' : ''}`}
          type="button"
          onClick={() => {
            setMergeMode((value) => !value)
            setSelected([])
          }}
        >
          {mergeMode ? '退出合并' : '合并'}
        </button>
      </header>

      <div className="ed-hint">
        {mergeMode ? '勾选相邻的几章，再点底部「合并」' : '点章节可改标题或拆分'}
        <span className="ed-count">{nodes.length} 章</span>
      </div>

      <div className="ed-list">
        {nodes.map((node, index) => (
          <div key={node.id} className={`ed-row ${selected.includes(index) ? 'on' : ''}`}>
            {mergeMode ? (
              <button
                type="button"
                className={`ed-check ${selected.includes(index) ? 'on' : ''}`}
                onClick={() =>
                  setSelected((list) =>
                    list.includes(index) ? list.filter((item) => item !== index) : [...list, index]
                  )
                }
              >
                {selected.includes(index) ? '✓' : ''}
              </button>
            ) : null}
            <button
              type="button"
              className="ed-main"
              onClick={() => {
                if (mergeMode) {
                  setSelected((list) =>
                    list.includes(index) ? list.filter((item) => item !== index) : [...list, index]
                  )
                  return
                }
                setActionIndex(index)
              }}
            >
              <span className="ed-title">{node.title}</span>
              <span className="ed-meta">{node.chars >= 1000 ? `${(node.chars / 1000).toFixed(1)} 千字` : `${node.chars} 字`}</span>
            </button>
          </div>
        ))}
      </div>

      {mergeMode ? (
        <div className="ed-foot">
          <span>已选 {selected.length} 章</span>
          <button
            type="button"
            className="primary"
            disabled={!isContiguous(selected)}
            onClick={() => {
              apply(mergeChapters(nodes, selected))
              setMergeMode(false)
              setToast('已合并')
            }}
          >
            合并
          </button>
        </div>
      ) : null}

      {actionNode ? (
        <div className="dialog-scrim" onClick={() => setActionIndex(null)}>
          <div className="dialog action-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>{actionNode.title}</h3>
            <button
              type="button"
              className="action-row"
              onClick={() => {
                setTarget(actionNode)
                setRenameText(actionNode.title)
                setRenameOpen(true)
                setActionIndex(null)
              }}
            >
              改标题
            </button>
            <button
              type="button"
              className="action-row"
              onClick={() => {
                setTarget(actionNode)
                setSplitOpen(true)
                setActionIndex(null)
              }}
            >
              拆分
            </button>
            <button type="button" className="action-row muted" onClick={() => setActionIndex(null)}>
              取消
            </button>
          </div>
        </div>
      ) : null}

      {renameOpen && target ? (
        <div className="dialog-scrim" onClick={() => setRenameOpen(false)}>
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
            <h3>改标题</h3>
            <input
              className="dialog-input"
              value={renameText}
              onChange={(event) => setRenameText(event.target.value)}
              autoFocus
            />
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setRenameOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                disabled={!renameText.trim()}
                onClick={() => {
                  apply(renameChapter(nodes, target.id, renameText.trim()))
                  setRenameOpen(false)
                  setToast('已改标题')
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {splitOpen && target ? (
        <div className="dialog-scrim" onClick={() => setSplitOpen(false)}>
          <div className="dialog split-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>在段落处拆分</h3>
            <div className="split-list">
              {splitParagraphs.length === 0 ? (
                <div className="drawer-empty">这一章没有可拆分的段落</div>
              ) : null}
              {splitParagraphs.map((item, index) => (
                <div key={item.boundary} className="split-row">
                  <span className="split-text">{item.text}</span>
                  <button
                    type="button"
                    className="mini"
                    onClick={() => {
                      const [left, right] = splitChapter(
                        target,
                        item.boundary,
                        `${target.title}（${index + 1}）`
                      )
                      const list = nodes.map((node) => (node.id === target.id ? left : node))
                      const position = list.findIndex((node) => node.id === left.id)
                      list.splice(position + 1, 0, right)
                      apply(list)
                      setSplitOpen(false)
                      setToast('已拆分')
                    }}
                  >
                    从此拆
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
