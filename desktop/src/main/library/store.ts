import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BookMeta, ChapterNode, LibraryIndex, Marks } from '../../shared/types'

const EMPTY_INDEX: LibraryIndex = { version: 1, books: [] }

export class LibraryStore {
  readonly root: string
  private index: LibraryIndex = { ...EMPTY_INDEX, books: [] }

  constructor(root: string) {
    this.root = root
  }

  init(): void {
    mkdirSync(this.root, { recursive: true })
    mkdirSync(join(this.root, 'books'), { recursive: true })
    const file = join(this.root, 'library.json')
    if (!existsSync(file)) {
      this.save()
      return
    }
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as LibraryIndex
      if (parsed && Array.isArray(parsed.books)) this.index = parsed
    } catch {
      // 索引损坏时保留空书库，不阻塞启动；原始数据仍在 books/ 下
      this.index = { ...EMPTY_INDEX, books: [] }
    }
  }

  list(): BookMeta[] {
    return [...this.index.books].sort((a, b) => (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt))
  }

  get(id: string): BookMeta | undefined {
    return this.index.books.find((book) => book.id === id)
  }

  findByHash(hash: string): BookMeta | undefined {
    return this.index.books.find((book) => book.sourceHash === hash)
  }

  upsert(book: BookMeta): void {
    const at = this.index.books.findIndex((item) => item.id === book.id)
    if (at >= 0) this.index.books[at] = book
    else this.index.books.push(book)
    this.save()
  }

  remove(id: string): void {
    this.index.books = this.index.books.filter((book) => book.id !== id)
    this.save()
    rmSync(join(this.root, 'books', id), { recursive: true, force: true })
  }

  bookDir(id: string): string {
    return join(this.root, 'books', id)
  }

  contentPath(id: string): string {
    return join(this.bookDir(id), 'content.txt')
  }

  tocPath(id: string): string {
    return join(this.bookDir(id), 'toc.json')
  }

  writeSourcePdf(id: string, data: Buffer): void {
    mkdirSync(this.bookDir(id), { recursive: true })
    writeFileSync(join(this.bookDir(id), 'source.pdf'), data)
  }

  pdfPath(id: string): string {
    return join(this.bookDir(id), 'source.pdf')
  }

  /** 写入真实封面（放在 images 目录，复用 wuya-media 协议） */
  writeCover(id: string, data: Buffer, ext: string): string {
    const dir = this.imagesDir(id)
    mkdirSync(dir, { recursive: true })
    const name = `__cover.${ext}`
    writeFileSync(join(dir, name), data)
    return name
  }

  imagesDir(id: string): string {
    return join(this.bookDir(id), 'images')
  }

  writeImages(id: string, images: { name: string; data: Buffer }[]): void {
    const dir = this.imagesDir(id)
    mkdirSync(dir, { recursive: true })
    for (const image of images) writeFileSync(join(dir, image.name), image.data)
  }

  tocOverridePath(id: string): string {
    return join(this.bookDir(id), 'toc.override.json')
  }

  readTocOverride(id: string): ChapterNode[] | null {
    try {
      const raw = readFileSync(this.tocOverridePath(id), 'utf-8')
      const parsed = JSON.parse(raw) as ChapterNode[]
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
    } catch {
      return null
    }
  }

  writeTocOverride(id: string, toc: ChapterNode[]): void {
    writeFileSync(this.tocOverridePath(id), JSON.stringify(toc), 'utf-8')
  }

  clearTocOverride(id: string): void {
    rmSync(this.tocOverridePath(id), { force: true })
  }

  marksPath(id: string): string {
    return join(this.bookDir(id), 'marks.json')
  }

  readMarks(id: string): Marks {
    try {
      return JSON.parse(readFileSync(this.marksPath(id), 'utf-8')) as Marks
    } catch {
      return { bookmarks: [], notes: [] }
    }
  }

  writeMarks(id: string, marks: Marks): void {
    mkdirSync(this.bookDir(id), { recursive: true })
    writeFileSync(this.marksPath(id), JSON.stringify(marks, null, 2), 'utf-8')
  }

  metaPath(id: string): string {
    return join(this.bookDir(id), 'meta.json')
  }

  writeMeta(id: string, meta: BookMeta): void {
    mkdirSync(this.bookDir(id), { recursive: true })
    writeFileSync(this.metaPath(id), JSON.stringify(meta, null, 2), 'utf-8')
  }

  writeBookFiles(id: string, content: string, toc: ChapterNode[], meta: BookMeta): void {
    const dir = this.bookDir(id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(this.contentPath(id), content, 'utf-8')
    writeFileSync(this.tocPath(id), JSON.stringify(toc), 'utf-8')
    writeFileSync(this.metaPath(id), JSON.stringify(meta, null, 2), 'utf-8')
  }

  readToc(id: string): ChapterNode[] {
    return JSON.parse(readFileSync(this.tocPath(id), 'utf-8')) as ChapterNode[]
  }

  private save(): void {
    const file = join(this.root, 'library.json')
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.index, null, 2), 'utf-8')
    renameSync(tmp, file)
  }
}
