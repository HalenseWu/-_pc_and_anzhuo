import type { ChapterNode } from './types'

/** 章内段落起始偏移（相对章首），含标题行 */
export function paragraphStarts(raw: string): number[] {
  const starts: number[] = []
  const matcher = /\n\s*\n/g
  while (true) {
    const found = matcher.exec(raw)
    if (!found) break
    const next = found.index + found[0].length
    if (next < raw.length) starts.push(next)
  }
  if (starts.length === 0) {
    const lines = raw.split('\n')
    let offset = 0
    for (let i = 1; i < lines.length; i += 1) {
      offset += lines[i - 1].length + 1
      if (lines[i].trim().length > 0) starts.push(offset)
    }
  }
  return starts.filter((value) => value > 0 && value < raw.length)
}

export function splitChapter(
  node: ChapterNode,
  boundary: number,
  rightTitle: string
): [ChapterNode, ChapterNode] {
  const cut = node.start + boundary
  const left: ChapterNode = { ...node, end: cut, chars: cut - node.start }
  const right: ChapterNode = {
    id: `${node.id}_s${Date.now().toString(36)}`,
    title: rightTitle,
    level: 2,
    start: cut,
    end: node.end,
    chars: node.end - cut
  }
  return [left, right]
}

export function mergeChapters(nodes: ChapterNode[], indices: number[]): ChapterNode[] {
  if (indices.length < 2) return nodes
  const sorted = [...indices].sort((a, b) => a - b)
  const first = nodes[sorted[0]]
  const last = nodes[sorted[sorted.length - 1]]
  const merged: ChapterNode = {
    ...first,
    end: last.end,
    chars: last.end - first.start
  }
  const result: ChapterNode[] = []
  nodes.forEach((node, index) => {
    if (index === sorted[0]) result.push(merged)
    else if (sorted.includes(index)) return
    else result.push(node)
  })
  return result
}

export function renameChapter(nodes: ChapterNode[], id: string, title: string): ChapterNode[] {
  return nodes.map((node) => (node.id === id ? { ...node, title } : node))
}

export function isContiguous(indices: number[]): boolean {
  if (indices.length < 2) return false
  const sorted = [...indices].sort((a, b) => a - b)
  return sorted[sorted.length - 1] - sorted[0] === sorted.length - 1
}
