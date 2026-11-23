import { useEffect } from 'react'
import { useStats } from '../store/stats'

/** 前台阅读计时：每 15 秒记 0.25 分钟 */
export function useReadingClock(bookId: string | null): void {
  const load = useStats((state) => state.load)
  const loaded = useStats((state) => state.loaded)
  const addMinutes = useStats((state) => state.addMinutes)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (!bookId) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void addMinutes(bookId, 0.25)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [bookId, addMinutes])
}
