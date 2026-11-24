const AD_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /www\./i,
  /请收藏本站/,
  /最新网址/,
  /最新章节/,
  /txt下载/i,
  /手机阅读/,
  /本章未完/,
  /无弹窗/,
  /一秒记住/,
  /公众号/,
  /书友群/,
  /加入书架/,
  /百度搜索/,
  /(本章完)/
]

const CHAPTER_HEAD_RE =
  /^[ \t]*第[一二三四五六七八九十百千零〇两0-9０-９]{1,10}[章节回卷部集篇][ \t·、:：\-—]?/

const SENTENCE_END = /[。！？…」』”"）】]$/
const DIALOGUE_START = /^[「『“"（(]/
const PAGE_NUMBER_RE = /^[-—\s]*[0-9]{1,4}[-—\s]*$|^第\s*[0-9]{1,4}\s*页$/
const INLINE_HEADING_RE = /第[一二三四五六七八九十百千零〇两0-9０-９]{1,10}[章节回]/
const BANNER_HINT_RE = /https?:\/\/|www\.|电子书|下载|请访问|章节内容|最新网址|txt|TXT|书友|公众号|百度/

/**
 * 有些 TXT 把站点横幅和第一章挤在同一行，例如：
 * 「爱下电子书…------章节内容开始-------1.第1章必须是穿越」
 * 这里把行内章节标题切出来，前面像广告的部分丢掉，否则整行会因过长被忽略，第一章就此消失。
 */
function splitInlineHeading(line: string): { prefix: string; heading: string } | null {
  if (line.length <= 40) return null
  const match = line.match(INLINE_HEADING_RE)
  if (!match || match.index === undefined || match.index === 0) return null
  const prefix = line.slice(0, match.index).trim()
  const heading = line.slice(match.index).trim()
  if (!BANNER_HINT_RE.test(prefix)) return null
  if (heading.length > 60) return null
  return { prefix, heading }
}

function normalize(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

function isAdLine(line: string): boolean {
  if (line.length > 60) return false
  return AD_PATTERNS.some((re) => re.test(line))
}

function isHeadingLike(line: string): boolean {
  return CHAPTER_HEAD_RE.test(line) || /^[ \t]*(序章|楔子|引子|前言|后记|尾声|终章|番外)/.test(line)
}

function shouldJoin(prev: string, next: string): boolean {
  const p = prev.trimEnd()
  if (p.length < 24) return false
  if (SENTENCE_END.test(p)) return false
  if (p.endsWith('：') || p.endsWith(':')) return false
  if (DIALOGUE_START.test(next.trimStart())) return false
  if (isHeadingLike(next)) return false
  return true
}

/** 去掉全文重复出现的短行（页眉/页脚/站点名） */
function dropRepeatedHeaders(lines: string[]): string[] {
  const counter = new Map<string, number>()
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.length > 20) continue
    counter.set(t, (counter.get(t) ?? 0) + 1)
  }
  const repeated = new Set<string>()
  for (const [text, count] of counter) {
    if (count >= 20 && !SENTENCE_END.test(text)) repeated.add(text)
  }
  if (repeated.size === 0) return lines
  return lines.filter((line) => !repeated.has(line.trim()))
}

/**
 * 清洗顺序：换行归一 → 去广告/页码 → 合并硬换行 → 压空行。
 * 注意：清洗会改变字符长度，章节偏移一律建立在清洗后的文本上。
 */
export function cleanText(raw: string): string {
  const normalized = normalize(raw)
    .replace(/[-—=]{2,}\s*章节内容开始\s*[-—=]{2,}/g, '\n')
    .replace(/[-—=]{2,}\s*章节内容结束\s*[-—=]{2,}/g, '\n')
  const rawLines = normalized.split('\n')

  const kept: string[] = []
  for (const line of rawLines) {
    const t = line.replace(/\u3000/g, ' ').trim()
    if (!t) {
      kept.push('')
      continue
    }
    if (isAdLine(t) || PAGE_NUMBER_RE.test(t)) continue
    const split = splitInlineHeading(t)
    if (split) {
      if (split.prefix.length > 0 && !isAdLine(split.prefix)) kept.push(split.prefix)
      kept.push(split.heading)
      continue
    }
    kept.push(t)
  }

  const lines = dropRepeatedHeaders(kept)

  // 合并被硬断开的行（中文 TXT 常见的 40 字换行）
  const merged: string[] = []
  for (const line of lines) {
    const current = line.trim()
    if (!current) {
      if (merged.length > 0 && merged[merged.length - 1] !== '') merged.push('')
      continue
    }
    const prevIndex = merged.length - 1
    if (prevIndex >= 0 && merged[prevIndex] !== '' && shouldJoin(merged[prevIndex], current)) {
      merged[prevIndex] = merged[prevIndex] + current
    } else {
      merged.push(current)
    }
  }

  // 压缩空行：段落之间最多一个空行
  const compact: string[] = []
  for (const line of merged) {
    if (line === '') {
      if (compact.length > 0 && compact[compact.length - 1] !== '') compact.push('')
    } else {
      compact.push(line)
    }
  }
  while (compact.length > 0 && compact[compact.length - 1] === '') compact.pop()

  return compact.join('\n')
}
