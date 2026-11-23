import { useEffect, useRef } from 'react'
import { acquireKeepAwake, releaseKeepAwake } from '../platform/keep-awake'

/**
 * 阅读常亮：主动作一次就重新计时，超过设定分钟数没有翻页/滚动就交还系统。
 * 返回一个 bump 函数，阅读页在翻页、滚动、点击时调用。
 */
export function useKeepAwake(enabled: boolean, minutes: number): () => void {
  const bumpRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    if (!enabled || minutes <= 0) {
      void releaseKeepAwake()
      return
    }
    let timer: number | null = null
    const arm = (): void => {
      void acquireKeepAwake()
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void releaseKeepAwake()
      }, minutes * 60_000)
    }
    bumpRef.current = arm
    arm()
    return () => {
      if (timer) window.clearTimeout(timer)
      bumpRef.current = () => undefined
      void releaseKeepAwake()
    }
  }, [enabled, minutes])

  return () => bumpRef.current()
}
