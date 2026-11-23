import { useEffect, useRef } from 'react'
import type { BookMeta } from '../../../shared/types'

/**
 * 阅读计时：每 15 秒上报一次，只有窗口可见、且最近 2 分钟内有操作才算“在读”。
 * takeChars 返回上一次上报以来读过的字数增量。
 */
export function useReadingClock(book: BookMeta | null, takeChars: () => number): void {
  const takeRef = useRef(takeChars)
  takeRef.current = takeChars

  useEffect(() => {
    if (!book) return
    let lastActive = Date.now()
    const mark = (): void => {
      lastActive = Date.now()
    }
    window.addEventListener('keydown', mark)
    window.addEventListener('mousedown', mark)
    window.addEventListener('wheel', mark, { passive: true })
    window.addEventListener('touchstart', mark, { passive: true })

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastActive > 120000) return
      const chars = takeRef.current()
      void window.wuya?.stats.add(book.id, book.title, 15, chars)
    }, 15000)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('keydown', mark)
      window.removeEventListener('mousedown', mark)
      window.removeEventListener('wheel', mark)
      window.removeEventListener('touchstart', mark)
    }
  }, [book?.id, book?.title])
}
