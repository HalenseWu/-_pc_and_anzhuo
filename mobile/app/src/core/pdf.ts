export type PdfDocument = {
  numPages: number
  getPage: (page: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number }
    render: (options: Record<string, unknown>) => { promise: Promise<void> }
  }>
}

interface PdfjsModule {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument: (options: { data: Uint8Array }) => { promise: Promise<PdfDocument> }
}

let pdfjsPromise: Promise<PdfjsModule> | null = null

/** 动态加载 pdf.js：老 WebView 不支持时也不影响书架和 TXT/EPUB 阅读 */
async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      ])
      const module = pdfjs as unknown as PdfjsModule
      module.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default
      return module
    })()
  }
  return pdfjsPromise
}

export async function openPdf(data: Uint8Array): Promise<PdfDocument> {
  const pdfjs = await loadPdfjs()
  return pdfjs.getDocument({ data }).promise
}

export interface RenderOptions {
  canvas: HTMLCanvasElement
  page: number
  width: number
  maxScale?: number
}

export async function renderPdfPage(doc: PdfDocument, options: RenderOptions): Promise<void> {
  const pdfPage = await doc.getPage(options.page)
  const base = pdfPage.getViewport({ scale: 1 })
  const ratio = Math.min(options.maxScale ?? 2, Math.max(1, window.devicePixelRatio || 1))
  const scale = (options.width / base.width) * ratio
  const viewport = pdfPage.getViewport({ scale })
  const canvas = options.canvas
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = '100%'
  canvas.style.height = 'auto'
  const context = canvas.getContext('2d')
  if (!context) return
  await pdfPage.render({ canvasContext: context, viewport, canvas }).promise
}
