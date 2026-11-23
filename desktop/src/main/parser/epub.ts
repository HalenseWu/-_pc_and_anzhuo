import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { posix } from 'node:path'
import type { ChapterNode } from '../../shared/types'

/* ---------------- 最小 ZIP 读取（store / deflate） ---------------- */

function readZip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1
  const min = Math.max(0, buf.length - 65557)
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 EPUB（找不到 zip 目录）')

  const count = buf.readUInt16LE(eocd + 10)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const entries = new Map<string, Buffer>()
  let p = cdOffset

  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')

    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const data = buf.subarray(dataStart, dataStart + compSize)

    if (!name.endsWith('/')) {
      entries.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data))
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function text(entries: Map<string, Buffer>, path: string): string | null {
  const item = entries.get(path)
  return item ? item.toString('utf8') : null
}

/* ---------------- HTML → 段落（含图片占位） ---------------- */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·'
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body] ?? whole
  })
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return match ? (match[2] ?? match[3] ?? null) : null
}

type ImageSink = (entryPath: string) => string | null

export function htmlToParagraphs(
  html: string,
  baseDir: string,
  sink?: ImageSink
): string[] {
  let body = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  const bodyMatch = body.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) body = bodyMatch[1]

  if (sink) {
    body = body.replace(/<(img|image)\b[^>]*>/gi, (tag) => {
      const src = attr(tag, 'src') ?? attr(tag, 'xlink:href') ?? attr(tag, 'href')
      if (!src || src.startsWith('data:')) return ''
      const resolved = posix.normalize(posix.join(baseDir, decodeURIComponent(src)))
      const name = sink(resolved)
      return name ? `\n[[img:${name}]]\n` : ''
    })
  }

  const spaced = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|blockquote|tr|figure)>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n')

  const stripped = spaced.replace(/<[^>]+>/g, '')
  return decodeEntities(stripped)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/* ---------------- OPF ---------------- */

interface ManifestItem {
  id: string
  href: string
  type: string
  properties: string
}

interface OpfData {
  title: string
  author: string
  manifest: ManifestItem[]
  spine: string[]
  ncxPath: string | null
  navPath: string | null
  coverId: string | null
  coverHref: string | null
}

function parseOpf(opf: string, opfPath: string): OpfData {
  const base = posix.dirname(opfPath)
  const manifest: ManifestItem[] = []
  const manifestBlock = opf.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/i)?.[1] ?? ''
  for (const tag of manifestBlock.match(/<item\b[^>]*\/?>/gi) ?? []) {
    const id = attr(tag, 'id')
    const href = attr(tag, 'href')
    if (!id || !href) continue
    manifest.push({
      id,
      href: posix.normalize(posix.join(base, decodeURIComponent(href))),
      type: attr(tag, 'media-type') ?? '',
      properties: attr(tag, 'properties') ?? ''
    })
  }

  const spineBlock = opf.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i)?.[1] ?? ''
  const spine = (spineBlock.match(/<itemref\b[^>]*>/gi) ?? [])
    .map((tag) => attr(tag, 'idref'))
    .filter((value): value is string => !!value)

  const title = decodeEntities(
    opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] ?? ''
  ).trim()
  const author = decodeEntities(
    opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1] ?? ''
  ).trim()

  const coverMeta = opf.match(/<meta[^>]*name\s*=\s*"cover"[^>]*content\s*=\s*"([^"]+)"/i)
  const coverId = coverMeta?.[1] ?? null
  const coverItem =
    manifest.find((item) => item.properties.includes('cover-image')) ??
    (coverId ? manifest.find((item) => item.id === coverId) : undefined) ??
    manifest.find((item) => item.type.startsWith('image/') && /cover/i.test(item.href))

  const nav = manifest.find((item) => item.properties.includes('nav'))
  const ncx = manifest.find((item) => item.type === 'application/x-dtbncx+xml')

  return {
    title,
    author,
    manifest,
    spine,
    navPath: nav?.href ?? null,
    ncxPath: ncx?.href ?? null,
    coverId: coverItem?.id ?? null,
    coverHref: coverItem?.href ?? null
  }
}

/* ---------------- 目录树 ---------------- */

interface NavNode {
  label: string
  path: string | null
  children: NavNode[]
}

function stripFragment(href: string): string {
  const at = href.indexOf('#')
  return at >= 0 ? href.slice(0, at) : href
}

/** 用 token 扫描 <ol> 嵌套，构建目录树 */
function parseNavTree(html: string, baseDir: string): NavNode[] {
  const roots: NavNode[] = []
  const stack: (NavNode | null)[] = []
  let depth = 0

  const tokenRe = /<(\/?)ol\b[^>]*>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = tokenRe.exec(html)) !== null) {
    if (match[1] === undefined) {
      // <a> 标签
      const attrs = match[2] ?? ''
      const label = decodeEntities((match[3] ?? '').replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim()
      const href = attr(attrs, 'href')
      if (!label) continue
      const node: NavNode = {
        label,
        path: href
          ? posix.normalize(posix.join(baseDir, stripFragment(decodeURIComponent(href))))
          : null,
        children: []
      }
      const parent = depth > 0 ? stack[depth - 1] : null
      if (parent) parent.children.push(node)
      else roots.push(node)
      stack[depth] = node
      stack.length = depth + 1
      continue
    }
    depth += match[1] === '/' ? -1 : 1
    if (depth < 0) depth = 0
    stack.length = depth + 1
  }
  return roots
}

function parseNcxTree(ncx: string, baseDir: string): NavNode[] {
  const nodes: NavNode[] = []
  const stack: NavNode[] = []

  const tokenRe = /<navPoint\b[^>]*>|<\/navPoint>|<text[^>]*>([\s\S]*?)<\/text>|<content\b[^>]*>/gi
  let pendingLabel: string | null = null
  let current: NavNode | null = null
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(ncx)) !== null) {
    const token = match[0]
    if (/^<navPoint/i.test(token)) {
      current = { label: '', path: null, children: [] }
      const parent = stack[stack.length - 1]
      if (parent) parent.children.push(current)
      else nodes.push(current)
      stack.push(current)
    } else if (/^<\/navPoint/i.test(token)) {
      stack.pop()
    } else if (/^<text/i.test(token)) {
      pendingLabel = decodeEntities(match[1] ?? '').replace(/\s+/g, ' ').trim()
      if (current && !current.label) current.label = pendingLabel
    } else if (/^<content/i.test(token) && current) {
      const src = attr(token, 'src')
      if (src) {
        current.path = posix.normalize(
          posix.join(baseDir, stripFragment(decodeURIComponent(src)))
        )
      }
    }
  }
  return nodes
}

function flattenNav(
  nodes: NavNode[],
  top: NavNode | null = null
): { node: NavNode; top: NavNode }[] {
  const out: { node: NavNode; top: NavNode }[] = []
  for (const node of nodes) {
    const topNode = top ?? node
    out.push({ node, top: topNode })
    out.push(...flattenNav(node.children, topNode))
  }
  return out
}

/* ---------------- 入口 ---------------- */

export interface ParsedEpub {
  cover: { data: Buffer; ext: string } | null
  title: string
  author: string
  content: string
  toc: ChapterNode[]
  chapterCount: number
  images: { name: string; data: Buffer }[]
}

export function parseEpub(buffer: Buffer): ParsedEpub {
  const entries = readZip(buffer)

  const container = text(entries, 'META-INF/container.xml')
  if (!container) throw new Error('EPUB 缺少 META-INF/container.xml')
  const rootPath = container.match(/full-path\s*=\s*("([^"]*)"|'([^']*)')/i)
  const opfPath = posix.normalize(rootPath?.[2] ?? rootPath?.[3] ?? '')
  const opfText = text(entries, opfPath)
  if (!opfText) throw new Error('EPUB 缺少 OPF 文件')

  const opf = parseOpf(opfText, opfPath)
  const byId = new Map(opf.manifest.map((item) => [item.id, item]))
  const docs = opf.spine
    .map((id) => byId.get(id))
    .filter((item): item is ManifestItem => !!item)
    .map((item) => item.href)

  if (docs.length === 0) throw new Error('EPUB 的 spine 为空')

  /* 目录树：nav → ncx → 空 */
  let navRoots: NavNode[] = []
  if (opf.navPath) {
    const navHtml = text(entries, opf.navPath)
    if (navHtml) {
      const tocBlock =
        navHtml.match(/<nav[^>]*epub:type\s*=\s*"toc"[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? navHtml
      navRoots = parseNavTree(tocBlock, posix.dirname(opf.navPath))
    }
  }
  if (navRoots.length === 0 && opf.ncxPath) {
    const ncx = text(entries, opf.ncxPath)
    if (ncx) navRoots = parseNcxTree(ncx, posix.dirname(opf.ncxPath))
  }

  const titleByPath = new Map<string, string>()
  const volumeByPath = new Map<string, string>()
  const volumeOrder: string[] = []
  for (const { node, top } of flattenNav(navRoots)) {
    if (node.path && node.label) {
      // 卷名的 href 常指向卷内第一章，深层节点（章）覆盖上层（卷）的标题
      titleByPath.set(node.path, node.label)
    }
    if (node.path && top !== node && top.label) {
      if (!volumeByPath.has(node.path)) volumeByPath.set(node.path, top.label)
      if (!volumeOrder.includes(top.label)) volumeOrder.push(top.label)
    }
  }

  /* 图片收集 */
  const images = new Map<string, Buffer>()
  const usedNames = new Set<string>()
  const sink: ImageSink = (entryPath) => {
    const data = entries.get(entryPath)
    if (!data) return null
    let name = posix.basename(entryPath).replace(/[^\w.\-]/g, '_')
    if (usedNames.has(name)) {
      name = `${createHash('sha1').update(entryPath).digest('hex').slice(0, 6)}-${name}`
    }
    usedNames.add(name)
    images.set(name, data)
    return name
  }

  /* 按 spine 拆章，同时按目录树归卷 */
  const blocks: string[] = []
  const chapters: ChapterNode[] = []
  let cursor = 0
  let index = 0
  const volumeNodes = new Map<string, ChapterNode>()

  for (const path of docs) {
    const html = text(entries, path)
    if (!html) continue
    const paragraphs = htmlToParagraphs(html, posix.dirname(path), sink)
    if (paragraphs.length === 0) continue

    index += 1
    const start = cursor
    const body = paragraphs.join('\n\n')
    blocks.push(body)
    cursor += body.length + 1

    const title = titleByPath.get(path) ?? `第 ${index} 章`
    const node: ChapterNode = {
      id: `c${index}`,
      title,
      level: 2,
      start,
      end: cursor,
      chars: cursor - start
    }

    const volumeTitle = volumeByPath.get(path)
    if (volumeTitle) {
      let volume = volumeNodes.get(volumeTitle)
      if (!volume) {
        volume = {
          id: `v${volumeNodes.size + 1}`,
          title: volumeTitle,
          level: 1,
          start,
          end: cursor,
          chars: 0,
          children: []
        }
        volumeNodes.set(volumeTitle, volume)
        chapters.push(volume)
      }
      volume.children?.push(node)
      volume.end = cursor
      volume.chars += node.chars
    } else {
      chapters.push(node)
    }
  }

  if (chapters.length === 0) throw new Error('EPUB 里没有可读取的正文')

  const content = blocks.join('\n')
  // 修正最后一段/卷的结束位置
  for (const node of chapters) {
    if (node.children?.length) {
      const lastChild = node.children[node.children.length - 1]
      lastChild.end = content.length
      lastChild.chars = lastChild.end - lastChild.start
      node.end = content.length
    } else if (node.end > content.length) {
      node.end = content.length
      node.chars = node.end - node.start
    }
  }

  let cover: { data: Buffer; ext: string } | null = null
  if (opf.coverHref) {
    const data = entries.get(opf.coverHref)
    if (data) {
      const raw = opf.coverHref.split('.').pop()?.toLowerCase() ?? 'jpg'
      const ext = raw === 'jpeg' ? 'jpg' : raw.replace(/[^a-z0-9]/g, '') || 'jpg'
      cover = { data, ext }
    }
  }

  return {
    title: opf.title || '未命名',
    author: opf.author || '佚名',
    content,
    toc: chapters,
    chapterCount: index,
    cover,
    images: [...images].map(([name, data]) => ({ name, data }))
  }
}
