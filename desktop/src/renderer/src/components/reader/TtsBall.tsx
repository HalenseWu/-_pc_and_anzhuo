import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { useTts } from '../../stores/tts'

interface Position {
  x: number
  y: number
}

const SIZE = 62

export function TtsBall(): React.JSX.Element | null {
  const playing = useTts((state) => state.playing)
  const paused = useTts((state) => state.paused)
  const speaking = useTts((state) => state.speaking)
  const pause = useTts((state) => state.pause)
  const resume = useTts((state) => state.resume)

  const [pos, setPos] = useState<Position | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const movedRef = useRef(false)
  const ballRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true
      if (!movedRef.current) return
      const maxX = window.innerWidth - SIZE - 8
      const maxY = window.innerHeight - SIZE - 8
      setPos({
        x: Math.max(8, Math.min(maxX, drag.originX + dx)),
        y: Math.max(8, Math.min(maxY, drag.originY + dy))
      })
    }
    const onUp = (): void => {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  if (!playing && !paused) return null

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const rect = ballRef.current?.getBoundingClientRect()
    movedRef.current = false
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pos?.x ?? rect?.left ?? window.innerWidth - SIZE - 44,
      originY: pos?.y ?? rect?.top ?? window.innerHeight - SIZE - 92
    }
  }

  const toggle = (): void => {
    if (paused) resume()
    else pause()
  }

  const style = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' } : undefined

  return (
    <div
      ref={ballRef}
      className={`tts-ball ${paused ? 'paused' : 'playing'} ${speaking ? '' : 'waiting'}`}
      style={style}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => {
        event.preventDefault()
        toggle()
      }}
      title={paused ? '左键继续 · 右键切换 · 可拖动' : '左键暂停 · 右键切换 · 可拖动'}
    >
      <span className="tts-ball-wave" aria-hidden="true">
        <i style={{ animationDelay: '0ms' }} />
        <i style={{ animationDelay: '140ms' }} />
        <i style={{ animationDelay: '280ms' }} />
      </span>
      <span className="tts-ball-ring" aria-hidden="true" />
      <button
        className="tts-ball-btn"
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          if (movedRef.current) {
            movedRef.current = false
            return
          }
          toggle()
        }}
      >
        <Icon id={paused ? 'i-play' : 'i-pause'} size={20} />
      </button>
    </div>
  )
}
