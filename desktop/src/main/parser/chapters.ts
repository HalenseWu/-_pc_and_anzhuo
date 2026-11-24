import type { ChapterNode, SuspiciousItem } from '../../shared/types'

interface Candidate {
  pos: number
  title: string
  level: 1 | 2
  prior: number
  num: number | null
}

interface Chunk {
  text: string
  start: number
}

const VOLUME_RE =
  /^第[一二三四五六七八九十百千零〇两0-9０-９]{1,10}[卷部集篇][ \t·、:：\-—]?[^\n]{0,40}$/
const CHAPTER_RE = /^第[一二三四五六七八九十百千零〇两0-9０-９]{1,10}[章节回][ \t·、:：\-—]?[^\n]{0,40}$/
/** 带序号前缀的章节行：`12.第12章 标题`、`12、第12章 标题`、`12) 第12章 标题` */
const CHAPTER_INDEXED_RE =
  /^(?:[0-9０-９]{1,4})[、.．)）][ \t]*第[一二三四五六七八九十百千零〇两0-9０-９]{1,10}[章节回][ \t·、:：\-—]?[^\n]{0,40}$/
const SPECIAL_RE = /^(序章|序言|楔子|引子|前言|后记|尾声|终章|番外)[^\n]{0,30}$/
const ENGLISH_RE = /^chapter[ \t]*[0-9]{1,4}[^\n]{0,40}$/i
const NUMERIC_RE = /^[0-9]{1,4}[、.．][ \t]?[^\n]{1,30}$/

const CN_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
}
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

function cnToNumber(input: string): number | null {
  const s = input.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  if (/^[0-9]+$/.test(s)) return Number(s)
  let total = 0
  let section = 0
  let digit = 0
  let seen = false
  for (const ch of s) {
    if (ch in CN_DIGIT) {
      digit = CN_DIGIT[ch]
      seen = true
    } else if (ch in CN_UNIT) {
      const unit = CN_UNIT[ch]
      section += (digit || (seen ? 0 : 1)) * unit
      digit = 0
      seen = true
    } else {
      return null
    }
  }
  total += section + digit
  return seen && total > 0 ? total : null
}

function extractNumber(title: string): number | null {
  const plain = title.replace(/^[0-9０-９]{1,4}[、.．)）][ \t]*/, '')
  const m = plain.match(/^第([一二三四五六七八九十百千零〇两0-9０-９]{1,10})[章节回卷部集篇]/)
  if (m) return cnToNumber(m[1])
  const en = title.match(/^chapter[ \t]*([0-9]{1,4})/i)
  if (en) return Number(en[1])
  const num = title.match(/^([0-9]{1,4})[、.．]/)
  if (num) return Number(num[1])
  return null
}

/** 去掉行首的 `12.` 这类序号，避免标题里出现两套编号 */
function normalizeTitle(title: string): string {
  const trimmed = title.replace(/^[0-9０-９]{1,4}[、.．)）][ \t]*(?=第)/, '')
  return trimmed || title
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function lineEndsBad(title: string): boolean {
  return /[，,。；;]$/.test(title)
}

function makeCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = []
  let pos = 0
  let prevBlank = true

  for (const raw of text.split('\n')) {
    const start = pos
    pos += raw.length + 1
    const line = raw.trim()
    if (!line) {
      prevBlank = true
      continue
    }
    const blankBefore = prevBlank
    prevBlank = false

    if (line.length > 48 || lineEndsBad(line)) continue

    let level: 1 | 2 | null = null
    let prior = 0
    if (VOLUME_RE.test(line)) {
      level = 1
      prior = 1
    } else if (CHAPTER_INDEXED_RE.test(line)) {
      level = 2
      prior = 0.86
    } else if (CHAPTER_RE.test(line)) {
      level = 2
      prior = 0.82
    } else if (SPECIAL_RE.test(line)) {
      level = 2
      prior = 0.86
    } else if (ENGLISH_RE.test(line)) {
      level = 2
      prior = 0.7
    } else if (NUMERIC_RE.test(line) && blankBefore) {
      level = 2
      prior = 0.45
    }
    if (!level) continue

    candidates.push({
      pos: start + (raw.length - raw.trimStart().length),
      title: normalizeTitle(line.replace(/\s+/g, ' ')),
      level,
      prior,
      num: extractNumber(line)
    })
  }

  // 距离过近的同级候选只保留分高的一个（卷→章这种挨着的是正常的，不能合并）
  const deduped: Candidate[] = []
  for (const cand of candidates) {
    const last = deduped[deduped.length - 1]
    if (last && last.level === cand.level && cand.pos - last.pos < 6) {
      if (cand.prior > last.prior) deduped[deduped.length - 1] = cand
      continue
    }
    deduped.push(cand)
  }

  // 同一章被两种写法重复识别（`17.第17章` 与紧跟的 `第17章`）时只留一条
  const merged: Candidate[] = []
  for (const cand of deduped) {
    const hitIndex = merged.findIndex(
      (item) =>
        item.level === cand.level &&
        item.num !== null &&
        item.num === cand.num &&
        Math.abs(cand.pos - item.pos) < 600
    )
    if (hitIndex < 0) {
      merged.push(cand)
      continue
    }
    const prev = merged[hitIndex]
    const better = rank(prev) >= rank(cand) ? prev : cand
    merged[hitIndex] = better
  }
  return merged
}

/** 同章重复时优先：无序号前缀 > 标题更长 > 位置更早 */
function rank(cand: Candidate): number {
  const prefixed = /^[0-9０-９]{1,4}[、.．)）]/.test(cand.title) ? 0 : 1
  return prefixed * 1000 + Math.min(cand.title.length, 60) * 10 - cand.pos / 1e9
}

export function debugCandidates(
  text: string
): { pos: number; title: string; level: number; num: number | null; prior: number }[] {
  return makeCandidates(text)
}

export interface ChapterDetectResult {
  toc: ChapterNode[]
  chapterCount: number
  volumeCount: number
  fallback: boolean
  suspicious: SuspiciousItem[]
}

function buildTree(text: string, chain: Candidate[]): ChapterNode[] {
  const nodes: ChapterNode[] = []
  let volume: ChapterNode | null = null
  let index = 0

  chain.forEach((cand, i) => {
    const start = cand.pos
    const end = i + 1 < chain.length ? chain[i + 1].pos : text.length
    index += 1
    const node: ChapterNode = {
      id: `c${index}`,
      title: cand.title,
      level: cand.level,
      start,
      end,
      chars: Math.max(0, end - start)
    }
    if (cand.level === 1) {
      node.children = []
      volume = node
      nodes.push(node)
    } else if (volume) {
      volume.children?.push(node)
    } else {
      nodes.push(node)
    }
  })

  return nodes
}

function flatten(nodes: ChapterNode[]): ChapterNode[] {
  const out: ChapterNode[] = []
  for (const node of nodes) {
    if (node.children?.length) out.push(...node.children)
    else out.push(node)
  }
  return out
}

function fallbackSplit(text: string): ChapterNode[] {
  const size = 8000
  const nodes: ChapterNode[] = []
  let start = 0
  let index = 1
  while (start < text.length) {
    let end = Math.min(text.length, start + size)
    const nextBreak = text.indexOf('\n', end)
    if (end < text.length && nextBreak !== -1 && nextBreak - end < 600) end = nextBreak + 1
    nodes.push({
      id: `c${index}`,
      title: `第 ${index} 节`,
      level: 2,
      start,
      end,
      chars: end - start
    })
    start = end
    index += 1
  }
  return nodes
}

/**
 * 目录识别：候选 → 打分 → 动态规划选一条全局最一致的链。
 * 链太短则退化为定长切分，并在报告里标记。
 */
export function detectChapters(text: string): ChapterDetectResult {
  const candidates = makeCandidates(text)

  if (candidates.length < 3) {
    const toc = fallbackSplit(text)
    return {
      toc,
      chapterCount: toc.length,
      volumeCount: 0,
      fallback: true,
      suspicious: [
        {
          chapterId: toc[0]?.id ?? 'c1',
          title: toc[0]?.title ?? '全文',
          kind: 'fallback',
          detail: `只识别到 ${candidates.length} 个章节标记，已按 8000 字切分`
        }
      ]
    }
  }

  const gaps: number[] = []
  for (let i = 1; i < candidates.length; i += 1) gaps.push(candidates[i].pos - candidates[i - 1].pos)
  const medianGap = median(gaps) || 3000

  const isVolumeToChapter = (prev: Candidate | undefined, cand: Candidate): boolean =>
    !!prev && prev.level === 1 && cand.level === 2

  const score = (cand: Candidate, prev: Candidate | undefined): number => {
    let s = cand.prior
    if (prev && !isVolumeToChapter(prev, cand) && cand.num !== null && prev.num !== null) {
      if (cand.num === prev.num + 1) s += 0.35
      else if (cand.num > prev.num) s += 0.15
      else s -= 0.25
    }
    if (isVolumeToChapter(prev, cand)) {
      // 卷标题后面紧跟第一章，属于正常结构
      s += 0.12
    } else if (prev && medianGap > 0) {
      const gap = cand.pos - prev.pos
      const ratio = Math.min(gap, medianGap) / Math.max(gap, medianGap)
      s += ratio * 0.2
    }
    const lineBefore = text.lastIndexOf('\n', cand.pos - 2)
    const isolated = lineBefore > 0 && text[lineBefore - 1] === '\n'
    if (isolated) s += 0.12
    return s
  }

  const n = candidates.length
  const dp = new Array<number>(n).fill(0)
  const prevIdx = new Array<number>(n).fill(-1)

  for (let i = 0; i < n; i += 1) {
    dp[i] = score(candidates[i], undefined)
    const from = Math.max(0, i - 64)
    for (let j = from; j < i; j += 1) {
      const gap = candidates[i].pos - candidates[j].pos
      /* 卷标题到第一章，或编号正好连着（上一章只有一行）时允许贴得很近 */
      const prevNum = candidates[j].num
      const curNum = candidates[i].num
      const adjacent = prevNum !== null && curNum !== null && curNum === prevNum + 1
      const minGap = isVolumeToChapter(candidates[j], candidates[i]) || adjacent ? 2 : 200
      if (gap < minGap) continue
      const value = dp[j] + score(candidates[i], candidates[j])
      if (value > dp[i]) {
        dp[i] = value
        prevIdx[i] = j
      }
    }
  }

  let best = 0
  for (let i = 1; i < n; i += 1) if (dp[i] > dp[best]) best = i

  const chain: Candidate[] = []
  let cursor = best
  while (cursor >= 0) {
    chain.push(candidates[cursor])
    cursor = prevIdx[cursor]
  }
  chain.reverse()

  if (chain.length < 3) {
    const toc = fallbackSplit(text)
    return {
      toc,
      chapterCount: toc.length,
      volumeCount: 0,
      fallback: true,
      suspicious: [
        {
          chapterId: toc[0]?.id ?? 'c1',
          title: toc[0]?.title ?? '全文',
          kind: 'fallback',
          detail: '章节标记过少，已按 8000 字切分'
        }
      ]
    }
  }

  const toc = buildTree(text, chain)

  // 首个章节标记之前的正文（简介、序、站点信息）不能丢：足够长就作为「前言」
  const leading = chain[0]?.pos ?? 0
  if (leading > 0) {
    const head = text.slice(0, leading)
    const meaningful = head
      .split('\n')
      .filter((line) => line.trim() && !/https?:\/\/|www\.|电子书|下载|请访问|最新章节/i.test(line))
      .join('')
    if (meaningful.length > 300) {
      toc.unshift({
        id: 'c0',
        title: '前言',
        level: 2,
        start: 0,
        end: leading,
        chars: leading
      })
    }
  }

  const chapters = flatten(toc)
  const volumes = toc.filter((node) => node.level === 1).length

  const suspicious: SuspiciousItem[] = []
  const seen = new Map<string, string>()
  for (const chapter of chapters) {
    if (chapter.chars < 50) {
      suspicious.push({
        chapterId: chapter.id,
        title: chapter.title,
        kind: 'short',
        detail: `仅 ${chapter.chars} 字`
      })
    } else if (chapter.chars > 50000) {
      suspicious.push({
        chapterId: chapter.id,
        title: chapter.title,
        kind: 'gap',
        detail: `单章 ${chapter.chars} 字，可能漏识别章节`
      })
    }
    const key = chapter.title
    if (seen.has(key)) {
      suspicious.push({
        chapterId: chapter.id,
        title: chapter.title,
        kind: 'duplicate',
        detail: '与前面的章节重名'
      })
    } else {
      seen.set(key, chapter.id)
    }
  }

  return {
    toc,
    chapterCount: chapters.length,
    volumeCount: volumes,
    fallback: false,
    suspicious: suspicious.slice(0, 20)
  }
}
