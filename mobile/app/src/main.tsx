import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/noto-serif-sc/400.css'
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css'
import { App } from './App'
import { useLibrary } from './store/library'
import { seedSample } from './dev/seed'
import './styles/app.css'

import { exportBackup, importBackup } from './core/backup'
import { useStats } from './store/stats'

declare global {
  interface Window {
    __devBackup?: {
      export: () => Promise<string>
      import: (base64: string) => Promise<{ added: number; skipped: number }>
    }
  }
}

if (location.search.includes('dev')) {
  void import('./store/reader').then(({ useReader }) => {
    ;(window as unknown as { __devReader: typeof useReader }).__devReader = useReader
  })
  window.__devBackup = {
    export: async () => {
      const blob = await exportBackup({
        library: useLibrary.getState().books,
        stats: useStats.getState().file
      })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      return btoa(binary)
    },
    import: async (base64: string) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const result = await importBackup(new Blob([bytes]))
      await useLibrary.getState().load()
      await useStats.getState().load()
      return { added: result.added, skipped: result.skipped }
    }
  }
}
async function bootstrap(): Promise<void> {
  if (location.search.includes('seed')) {
    const library = useLibrary.getState()
    await library.load()
    if (library.books.length === 0) {
      await library.importFile(await seedSample())
    }
  }
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
