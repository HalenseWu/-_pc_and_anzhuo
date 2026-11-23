import { useEffect, useMemo, useState } from 'react'
import type { ChapterNode } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { WindowButtons } from '../components/WindowButtons'
import { useEditor } from '../stores/editor'
import { useLibrary } from '../stores/library'

interface EditNode {
  id: string
  title: string
  start: number
  end: number
  level: 1 | 2
}

function flatten(tree: ChapterNode[]): EditNode[] {
  const list: EditNode[] = []
  for (const node of tree) {
    if (node.children?.length) {
      list.push({ id: node.id, title: node.title, start: node.start, end: node.children[0].start, level: 1 })
      for (const child of node.children) {
        list.push({ id: child.id, title: child.title, start: child.start, end: child.end, level: 2 })
      }
    } else {
      list.push({ id: node.id, title: node.title, start: node.start, end: node.end, level: 2 })
    }
  }
  return list
}

function build(list: EditNode[]): ChapterNode[] {
  const tree: ChapterNode[] = []
  let volume: ChapterNode | null = null
  let seq = 0
  for (const item of list) {
    seq += 1
    const node: ChapterNode = {
      id: item.id || `c${seq}`,
      title: item.title.trim() || '未命名',
      level: item.level,
      start: item.start,
      end: item.end,
      chars: Math.max(0, item.end - item.start)
    }
    if (item.level === 1) {
      node.children = []
      volume = node
      tree.push(node)
    } else if (volume) {
      volume.children?.push(node)
    } else {
      tree.push(node)
    }
  }
  for (const node of tree) {
    if (node.children?.length) {
      node.end = node.children[node.children.length - 1].end
      node.chars = node.children.reduce((sum, child) => sum + child.chars, 0)
    }
  }
  return tree
}

export function TocEditor(): React.JSX.Element | null {
  const book = useEditor((state) => state.book)
  const close = useEditor((state) => state.close)
  const [flat, setFlat] = useState<EditNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [splitOffset, setSplitOffset] = useState<number | null>(null)
  const [slice, setSlice] = useState('')
  const [history, setHistory] = useState<EditNode[][]>([])
  const [future, setFuture] = useState<EditNode[][]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!book) return
    void (async () => {
      const tree = (await window.wuya?.toc.get(book.id)) ?? []
      const list = flatten(tree)
      setFlat(list)
      setSelectedId((list.find((node) => node.level === 2) ?? list[0])?.id ?? null)
      setHistory([])
      setFuture([])
      setDirty(false)
    })()
  }, [book?.id])

  const selected = flat.find((node) => node.id === selectedId) ?? null
  const selectedStart = selected?.start ?? 0
  const selectedEnd = selected?.end ?? 0

  useEffect(() => {
    if (!book || !selected) {
      setSlice('')
      return
    }
    let cancelled = false
    void (async () => {
      const text = (await window.wuya?.toc.slice(book.id, selectedStart, selectedEnd)) ?? ''
      if (!cancelled) setSlice(text)
    })()
    return () => {
      cancelled = true
    }
  }, [book?.id, selectedId, selectedStart, selectedEnd])

  const lines = useMemo(() => {
    if (!selected) return []
    const out: { text: string; offset: number; index: number }[] = []
    let cursor = selectedStart
    let index = 0
    for (const text of slice.split('\n')) {
      out.push({ text, offset: cursor, index })
      cursor += text.length + 1
      index += 1
    }
    return out
  }, [slice, selectedStart, selected])

  const apply = (updater: (list: EditNode[]) => { list: EditNode[]; selected?: string }): void => {
    if (!flat.length) return
    const result = updater(flat)
    if (result.list === flat) return
    setHistory((value) => [...value.slice(-49), flat])
    setFuture([])
    setFlat(result.list)
    if (result.selected) setSelectedId(result.selected)
    setSplitOffset(null)
    setDirty(true)
  }

  const undo = (): void => {
    const previous = history[history.length - 1]
    if (!previous) return
    setHistory((value) => value.slice(0, -1))
    setFuture((value) => [flat, ...value])
    setFlat(previous)
    setDirty(true)
  }

  const redo = (): void => {
    const next = future[0]
    if (!next) return
    setFuture((value) => value.slice(1))
    setHistory((value) => [...value, flat])
    setFlat(next)
    setDirty(true)
  }

  const rename = (title: string): void => {
    if (!selected) return
    setFlat((value) => value.map((node) => (node.id === selected.id ? { ...node, title } : node)))
    setDirty(true)
  }

  const splitAt = (offset: number): void => {
    if (!selected || offset <= selected.start || offset >= selected.end) return
    const rest = slice.slice(offset - selected.start)
    const firstLine = rest.split('\n').find((line) => line.trim()) ?? '新章节'
    const title = firstLine.trim().slice(0, 24)
    const id = `n_${Date.now().toString(36)}`
    apply((list) => {
      const index = list.findIndex((node) => node.id === selected.id)
      if (index < 0) return { list }
      const next = [...list]
      next[index] = { ...next[index], end: offset }
      next.splice(index + 1, 0, { id, title, start: offset, end: selected.end, level: 2 })
      return { list: next, selected: id }
    })
  }

  const mergeNext = (): void => {
    if (!selected) return
    apply((list) => {
      const index = list.findIndex((node) => node.id === selected.id)
      const next = list[index + 1]
      if (!next || next.level === 1) return { list }
      const out = [...list]
      out[index] = { ...out[index], end: next.end }
      out.splice(index + 1, 1)
      return { list: out, selected: selected.id }
    })
  }

  const removeNode = (): void => {
    if (!selected || flat.length <= 1) return
    apply((list) => {
      const index = list.findIndex((node) => node.id === selected.id)
      if (index < 0) return { list }
      const node = list[index]
      const prev = list[index - 1]
      const next = list[index + 1]
      const out = [...list]
      if (prev && prev.level === 2) out[index - 1] = { ...prev, end: node.end }
      else if (next) out[index + 1] = { ...next, start: node.start }
      out.splice(index, 1)
      return { list: out, selected: out[Math.min(index, out.length - 1)]?.id }
    })
  }

  const toggleVolume = (): void => {
    if (!selected) return
    apply((list) => {
      const index = list.findIndex((node) => node.id === selected.id)
      if (index < 0) return { list }
      const out = [...list]
      if (selected.level === 1) {
        out[index] = { ...out[index], level: 2 }
      } else {
        const next = out[index + 1]
        out[index] = { ...out[index], level: 1, end: next ? next.start : out[index].end }
      }
      return { list: out, selected: selected.id }
    })
  }

  const save = async (): Promise<void> => {
    if (!book) return
    const tree = build(flat)
    if (tree.some((node) => node.children && node.children.length === 0)) {
      setNotice('有一卷下面没有章节，先删掉或改成普通章节')
      return
    }
    setSaving(true)
    await window.wuya?.toc.save(book.id, tree)
    await useLibrary.getState().load()
    setSaving(false)
    setDirty(false)
    setNotice('已保存，下次打开这本书会按新目录章节划分')
    window.setTimeout(() => setNotice(null), 2600)
  }

  const reset = async (): Promise<void> => {
    if (!book) return
    const tree = (await window.wuya?.toc.reset(book.id)) ?? []
    const list = flatten(tree)
    setFlat(list)
    setSelectedId(list[0]?.id ?? null)
    setHistory([])
    setFuture([])
    setDirty(false)
    setNotice('已恢复为自动识别的结果')
    window.setTimeout(() => setNotice(null), 2200)
  }

  if (!book) return null

  const total = flat.reduce((sum, node) => sum + Math.max(0, node.end - node.start), 0)

  return (
    <div className="te-root">
      <header className="te-tb">
        <div className="te-tb-l">
          <button className="iconbtn" type="button" title="返回书架" onClick={close}>
            <Icon id="i-left" />
          </button>
          <span className="te-book">{book.title}</span>
          <span className="te-sep">/</span>
          <span className="te-sub">目录校正</span>
        </div>
        <div className="te-tb-r">
          <button className="te-btn" type="button" disabled={history.length === 0} onClick={undo}>
            撤销
          </button>
          <button className="te-btn" type="button" disabled={future.length === 0} onClick={redo}>
            重做
          </button>
          <button className="te-btn" type="button" onClick={() => void reset()}>
            恢复自动识别
          </button>
          <button
            className="te-save"
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : dirty ? '保存目录' : '已保存'}
          </button>
          <WindowButtons />
        </div>
      </header>

      <div className="te-body">
        <section className="te-left">
          <div className="te-head">
            原文
            {selected ? (
              <span>
                第 {flat.findIndex((node) => node.id === selected.id) + 1} 条 · 字数{' '}
                {Math.max(0, selected.end - selected.start)}
              </span>
            ) : null}
          </div>
          <div className="te-lines">
            {lines.map((line) => {
              const picked = splitOffset === line.offset
              return (
                <button
                  key={line.offset}
                  className={`te-line ${picked ? 'picked' : ''}`}
                  type="button"
                  onClick={() => setSplitOffset(line.offset)}
                >
                  <span className="te-ln">{line.index + 1}</span>
                  <span className="te-lt">{line.text || ' '}</span>
                </button>
              )
            })}
          </div>
        </section>

        <aside className="te-right">
          <div className="te-head">
            章节结构
            <span>
              {flat.filter((node) => node.level === 1).length} 卷 ·{' '}
              {flat.filter((node) => node.level === 2).length} 章 · {total} 字
            </span>
          </div>
          <div className="te-list">
            {flat.map((node, index) => (
              <button
                key={node.id}
                className={`te-item ${node.id === selectedId ? 'on' : ''} ${node.level === 1 ? 'vol' : ''}`}
                type="button"
                onClick={() => {
                  setSelectedId(node.id)
                  setSplitOffset(null)
                }}
              >
                <span className="te-idx">{node.level === 1 ? '卷' : index + 1}</span>
                <span className="te-title">{node.title}</span>
                <span className="te-chars">{Math.max(0, node.end - node.start)}</span>
              </button>
            ))}
          </div>

          <div className="te-actions">
            <input
              className="te-input"
              value={selected?.title ?? ''}
              placeholder="章节标题"
              disabled={!selected}
              onChange={(event) => rename(event.target.value)}
            />
            <div className="te-btns">
              <button
                className="te-btn"
                type="button"
                disabled={splitOffset === null || !selected || splitOffset <= selected.start}
                onClick={() => splitOffset !== null && splitAt(splitOffset)}
              >
                从选中行拆分
              </button>
              <button className="te-btn" type="button" disabled={!selected} onClick={mergeNext}>
                并入下一章
              </button>
              <button className="te-btn" type="button" disabled={!selected} onClick={toggleVolume}>
                {selected?.level === 1 ? '取消卷' : '设为卷'}
              </button>
              <button
                className="te-btn danger"
                type="button"
                disabled={!selected || flat.length <= 1}
                onClick={removeNode}
              >
                删除
              </button>
            </div>
            <p className="te-tip">
              左侧点一行、再点「从选中行拆分」，就在那一行前断开；「并入下一章」把当前章和下一章合成一章。改动只写进
              sidecar，不动原文件。
            </p>
          </div>
        </aside>
      </div>

      {notice ? <div className="te-notice">{notice}</div> : null}
    </div>
  )
}
