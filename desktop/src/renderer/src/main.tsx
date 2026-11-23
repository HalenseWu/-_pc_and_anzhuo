import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/app.css'
import './styles/reader.css'
import './styles/marks.css'
import './styles/pdf.css'
import './styles/toc-editor.css'
import './styles/stats.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
