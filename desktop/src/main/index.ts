import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { registerIpc } from './ipc'
import { importBookFile } from './library/importer'
import { LibraryStore } from './library/store'

protocol.registerSchemesAsPrivileged([
  { scheme: 'wuya-media', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'wuya-pdf', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

let mainWindow: BrowserWindow | null = null

const MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

/** 开发用：--capture=<png path> 启动后截图并退出 */
const captureArg = process.argv.find((arg) => arg.startsWith('--capture='))
/** 开发用：--import-test=<txt path> 启动后导入一个文件，便于端到端验证 */
const importArg = process.argv.find((arg) => arg.startsWith('--import-test='))
/** 开发用：--open-reader 启动后直接打开第一本书的阅读页 */
const openReader = process.argv.includes('--open-reader')
/** 开发用：--reader-panel=toc|settings 打开阅读页时直接展开某个面板 */
const panelArg = process.argv.find((arg) => arg.startsWith('--reader-panel='))
/** 开发用：--reader-mode=scroll 打开时使用上下滚动模式 */
const modeArg = process.argv.find((arg) => arg.startsWith('--reader-mode='))
/** 开发用：--reader-anim=cover 打开时指定翻页动画 */
const animArg = process.argv.find((arg) => arg.startsWith('--reader-anim='))
/** 开发用：--reader-query="pw=720&spread=1" 以查询串方式打开阅读页，便于复现测试 */
const queryArg = process.argv.find((arg) => arg.startsWith('--reader-query='))
const readerHash = queryArg
  ? `reader?${queryArg.slice('--reader-query='.length)}`
  : animArg
    ? `reader-${animArg.slice('--reader-anim='.length)}`
    : modeArg
      ? `reader-${modeArg.slice('--reader-mode='.length)}`
      : panelArg
        ? `reader-${panelArg.slice('--reader-panel='.length)}`
        : 'reader'
/** 开发用：--press=PageDown:3 截图前模拟按键，验证翻页/滚动 */
const pressArg = process.argv.find((arg) => arg.startsWith('--press='))
/** 开发用：--capture-after=2700 覆盖截图延迟，便于抓动画中间帧 */
const captureAfterArg = process.argv.find((arg) => arg.startsWith('--capture-after='))
const captureDelay = captureAfterArg ? Number(captureAfterArg.split('=')[1]) || 4400 : 4400
/** 开发用：--click=160,180 在截屏前点击某个坐标 */
const clickArg = process.argv.find((arg) => arg.startsWith('--click='))
/** 开发用：--wheel=300,500,-360,3 在截屏前把指针移到坐标并滚轮 */
const wheelArg = process.argv.find((arg) => arg.startsWith('--wheel='))
/** 开发用：--search=关键词 启动后在书架执行全库搜索 */
const searchArg = process.argv.find((arg) => arg.startsWith('--search='))
/** 开发用：--backup-export=路径 / --backup-import=路径，不走对话框 */
const backupExportArg = process.argv.find((arg) => arg.startsWith('--backup-export='))
const backupImportArg = process.argv.find((arg) => arg.startsWith('--backup-import='))
/** 开发用：--drag=x1,y1,x2,y2 模拟拖选 */
const dragArg = process.argv.find((arg) => arg.startsWith('--drag='))
/** 开发用：--editor 打开第一本书的目录校正 */
const editorArg = process.argv.includes('--editor')
/** 开发用：--stats 打开阅读统计（带 WUYA_EXPORT_PATH 时自动导出周报） */
const statsArg = process.argv.includes('--stats')
/** 开发用：--bookmarks 打开全部书签 */
const bookmarksArg = process.argv.includes('--bookmarks')
/** 开发用：--window=1600x1000 指定窗口尺寸 */
const windowArg = process.argv.find((arg) => arg.startsWith('--window='))
const windowSize = (() => {
  if (!windowArg) return { width: 1440, height: 900 }
  const [w, h] = windowArg.slice('--window='.length).split('x').map(Number)
  return { width: w || 1440, height: h || 900 }
})()

function setupCapture(win: BrowserWindow, target: string): void {
  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const image = await win.webContents.capturePage()
        writeFileSync(target, image.toPNG())
        console.log(`[capture] saved ${target}`)
      } catch (error) {
        console.error('[capture] failed', error)
      } finally {
        app.quit()
      }
    }, captureDelay)
  })
}

function createWindow(store: LibraryStore): void {
  mainWindow = new BrowserWindow({
    width: windowSize.width,
    height: windowSize.height,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#F7F3EA',
    title: '无涯',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.WUYA_DEBUG) {
    mainWindow.webContents.on('console-message', (_e, _level, message) => console.log('[renderer]', message))
  }

  if (backupExportArg || backupImportArg) {
    void (async () => {
      const { LibraryStore } = await import('./library/store')
      const { StatsStore } = await import('./library/stats')
      const { exportBackup, importBackup } = await import('./backup')
      const root = process.env.WUYA_DATA_DIR || join(app.getPath('appData'), '无涯')
      const store = new LibraryStore(root)
      const stats = new StatsStore(root)
      if (backupExportArg) {
        const target = backupExportArg.slice('--backup-export='.length)
        const bytes = await exportBackup(store, stats, target)
        console.log('[backup] exported', target, bytes)
      }
      if (backupImportArg) {
        const source = backupImportArg.slice('--backup-import='.length)
        const summary = await importBackup(store, source)
        console.log('[backup] imported', JSON.stringify(summary))
      }
      app.quit()
    })()
  }

  if (captureArg) setupCapture(mainWindow, captureArg.slice('--capture='.length))

  if (clickArg) {
    const points = clickArg
      .slice('--click='.length)
      .split(';')
      .map((pair) => pair.split(',').map(Number))
    mainWindow.webContents.on('did-finish-load', () => {
      points.forEach(([cx, cy], index) => {
        setTimeout(() => {
          mainWindow?.webContents.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 })
          mainWindow?.webContents.sendInputEvent({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 })
        }, 3200 + index * 700)
      })
    })
  }

  if (wheelArg) {
    const [wx, wy, dy, count] = wheelArg
      .slice('--wheel='.length)
      .split(',')
      .map(Number)
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        mainWindow?.webContents.sendInputEvent({ type: 'mouseMove', x: wx, y: wy })
        for (let i = 0; i < (count || 1); i += 1) {
          setTimeout(() => {
            mainWindow?.webContents.sendInputEvent({
              type: 'mouseWheel',
              x: wx,
              y: wy,
              deltaX: 0,
              deltaY: dy || -120,
              canScroll: true
            })
          }, i * 60)
        }
      }, 3200)
    })
  }

  if (dragArg) {
    const [x1, y1, x2, y2] = dragArg.slice('--drag='.length).split(',').map(Number)
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        mainWindow?.webContents.sendInputEvent({ type: 'mouseDown', x: x1, y: y1, button: 'left', clickCount: 1 })
        mainWindow?.webContents.sendInputEvent({ type: 'mouseMove', x: x2, y: y2, button: 'left' })
        mainWindow?.webContents.sendInputEvent({ type: 'mouseUp', x: x2, y: y2, button: 'left', clickCount: 1 })
      }, 3200)
    })
  }

  if (pressArg) {
    const specs = pressArg.slice('--press='.length).split(',')
    mainWindow.webContents.on('did-finish-load', () => {
      let delay = 2600
      for (const spec of specs) {
        const [keyName, timesText] = spec.split(':')
        const times = Number(timesText) || 1
        setTimeout(() => {
          for (let i = 0; i < times; i += 1) {
            mainWindow?.webContents.sendInputEvent({ type: 'keyDown', keyCode: keyName })
            mainWindow?.webContents.sendInputEvent({ type: 'keyUp', keyCode: keyName })
          }
        }, delay)
        delay += 300
      }
    })
  }

  mainWindow.on('maximize', () => mainWindow?.webContents.send('win:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('win:maximized', false))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 外链一律用系统浏览器打开，绝不在应用内导航
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void mainWindow.loadURL(openReader ? `${devUrl}#${readerHash}` : devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      ...(openReader ? { hash: readerHash } : {}),
      ...(searchArg
        ? { search: `?libsearch=${encodeURIComponent(searchArg.slice('--search='.length))}` }
        : {}),
      ...(editorArg ? { hash: 'editor' } : {}),
      ...(statsArg ? { hash: 'stats?export=1' } : {}),
      ...(bookmarksArg ? { hash: 'bookmarks' } : {})
    })
  }
}

function registerWindowIpc(): void {
  ipcMain.on('win:minimize', () => mainWindow?.minimize())
  ipcMain.on('win:toggle-maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('win:close', () => mainWindow?.close())
  ipcMain.handle('win:is-maximized', () => mainWindow?.isMaximized() ?? false)
}

app.whenReady().then(async () => {
  const dataDir = process.env.WUYA_DATA_DIR ?? app.getPath('userData')
  const store = new LibraryStore(dataDir)
  store.init()

  if (importArg) {
    const file = importArg.slice('--import-test='.length)
    const result = await importBookFile({ store, emit: () => {}, taskId: 'test' }, file)
    console.log(`[import-test] ok=${result.ok} skipped=${result.skipped ?? ''} error=${result.error ?? ''}`)
    const book = result.book
    if (book) console.log(`[import-test] ${book.title} / ${book.chapterCount} 章 / ${book.totalChars} 字 / ${book.encoding}`)
  }

  protocol.handle('wuya-pdf', (request) => {
    try {
      const parts = new URL(request.url).pathname.split('/').filter(Boolean)
      const data = readFileSync(store.pdfPath(parts[0] ?? ''))
      return new Response(data, { headers: { 'content-type': 'application/pdf' } })
    } catch {
      return new Response('', { status: 404 })
    }
  })

  protocol.handle('wuya-media', async (request) => {
    try {
      const parts = new URL(request.url).pathname.split('/').filter(Boolean)
      const bookId = parts[0] ?? ''
      const file = basename(parts[1] ?? '')
      if (!bookId || !file) return new Response('', { status: 400 })
      const data = readFileSync(join(store.imagesDir(bookId), file))
      return new Response(data, {
        headers: { 'content-type': MEDIA_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' }
      })
    } catch {
      return new Response('', { status: 404 })
    }
  })

  registerWindowIpc()
  registerIpc(store, () => mainWindow)
  createWindow(store)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(store)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
