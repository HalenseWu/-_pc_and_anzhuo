import JSZip from 'jszip'
import type { ChapterNode } from './types'

export interface ParsedEpub {
  content: string
  tocs: ChapterNode[]
  chapters: ChapterNode[]
  title: string
  author: string
  cover: string | null
}

function resolvePath(base: string, href: string): string {
  if (href.startsWith('/')) return href.slice(1)
  const stack = base.split('/').slice(0, -1)
  for (const part of href.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function textOf(node: Element | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** 把 XHTML 变成段落数组：优先块级元素，退化为按换行切 */
function htmlToParagraphs(html: string): { paragraphs: string[]; heading: string } {
  const doc = new DOMParser().parseFromString(html, 'application/xhtml+xml')
  const root = doc.documentElement
  const heading =
    textOf(root.querySelector('h1')) || textOf(root.querySelector('h2')) || textOf(root.querySelector('title'))

  const blocks = Array.from(root.querySelectorAll('p, div, li, blockquote, h1, h2, h3, h4, h5, h6'))
  const paragraphs: string[] = []
  for (const block of blocks) {
    // 只取没有块级子元素的叶子节点，避免重复
    if (block.querySelector('p, div, li, blockquote')) continue
    const text = textOf(block)
    if (text.length > 0) paragraphs.push(text)
  }
  if (paragraphs.length === 0) {
    const body = textOf(root.querySelector('body') ?? root)
    for (const line of body.split(/\n+/)) {
      const text = line.trim()
      if (text) paragraphs.push(text)
    }
  }
  return { paragraphs, heading }
}

export async function parseEpub(buffer: ArrayBuffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(buffer)

  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) throw new Error('不是有效的 EPUB（缺少 container.xml）')
  const container = new DOMParser().parseFromString(await containerFile.async('text'), 'application/xml')
  const rootfile = container.querySelector('rootfile')?.getAttribute('full-path')
  if (!rootfile) throw new Error('不是有效的 EPUB（缺少 OPF 路径）')

  const opfText = await zip.file(rootfile)?.async('text')
  if (!opfText) throw new Error('不是有效的 EPUB（读不到 OPF）')
  const opf = new DOMParser().parseFromString(opfText, 'application/xml')

  const title = textOf(opf.querySelector('metadata > *|dc\\:title')) || textOf(opf.getElementsByTagName('dc:title')[0])
  const author =
    textOf(opf.getElementsByTagName('dc:creator')[0]) || textOf(opf.getElementsByTagName('dc:creator')[0])

  const manifest = new Map<string, { href: string; type: string; properties: string }>()
  for (const item of Array.from(opf.getElementsByTagName('item'))) {
    const id = item.getAttribute('id') ?? ''
    const href = item.getAttribute('href') ?? ''
    manifest.set(id, {
      href: resolvePath(rootfile, href),
      type: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? ''
    })
  }

  const spineIds: string[] = []
  for (const itemref of Array.from(opf.getElementsByTagName('itemref'))) {
    const idref = itemref.getAttribute('idref')
    if (idref) spineIds.push(idref)
  }

  /* 目录：EPUB3 nav 或 EPUB2 ncx，用 href → 标题 映射 */
  const titleByHref = new Map<string, string>()
  try {
    const navItem = Array.from(manifest.values()).find(
      (item) => item.properties.includes('nav') || item.type.includes('nav')
    )
    if (navItem) {
      const navText = await zip.file(navItem.href)?.async('text')
      if (navText) {
        const nav = new DOMParser().parseFromString(navText, 'application/xhtml+xml')
        for (const anchor of Array.from(nav.getElementsByTagName('a'))) {
          const href = anchor.getAttribute('href') ?? ''
          const key = resolvePath(navItem.href, href.split('#')[0])
          const label = textOf(anchor)
          if (key && label && !titleByHref.has(key)) titleByHref.set(key, label)
        }
      }
    }
  } catch {
    /* 目录解析失败就退回标题猜测 */
  }

  /* 封面 */
  let cover: string | null = null
  try {
    let coverItem = Array.from(manifest.values()).find((item) => item.properties.includes('cover-image'))
    if (!coverItem) {
      const meta = Array.from(opf.getElementsByTagName('meta')).find(
        (item) => item.getAttribute('name') === 'cover'
      )
      const coverId = meta?.getAttribute('content')
      if (coverId && manifest.has(coverId)) coverItem = manifest.get(coverId)
    }
    if (coverItem) {
      const file = zip.file(coverItem.href)
      if (file) {
        const blob = await file.async('base64')
        cover = `data:${coverItem.type || 'image/jpeg'};base64,${blob}`
      }
    }
  } catch {
    cover = null
  }

  /* 按 spine 拼正文 */
  let content = ''
  const tocs: ChapterNode[] = []
  let index = 0
  for (const id of spineIds) {
    const item = manifest.get(id)
    if (!item) continue
    const file = zip.file(item.href)
    if (!file) continue
    const html = await file.async('text')
    const { paragraphs, heading } = htmlToParagraphs(html)
    const body = paragraphs.filter((text) => text.length > 0)
    if (body.length === 0) continue
    index += 1
    const label = titleByHref.get(item.href) ?? heading ?? `第 ${index} 节`
    const start = content.length
    content += `${label}\n\n${body.join('\n\n')}\n\n`
    const end = content.length
    tocs.push({
      id: `c${index}`,
      title: label,
      level: 2,
      start,
      end,
      chars: end - start
    })
  }

  return { content, tocs, chapters: tocs, title, author, cover }
}
