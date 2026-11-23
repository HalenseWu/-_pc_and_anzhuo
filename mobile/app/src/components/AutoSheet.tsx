interface Props {
  open: boolean
  onClose: () => void
  running: boolean
  mode: 'page' | 'scroll'
  pageSec: number
  scrollPx: number
  suggestedPage: number | null
  suggestedScroll: number | null
  onPageSec: (value: number) => void
  onScrollPx: (value: number) => void
  onToggle: () => void
  onUseSuggestion: () => void
}

export function AutoSheet({
  open,
  onClose,
  running,
  mode,
  pageSec,
  scrollPx,
  suggestedPage,
  suggestedScroll,
  onPageSec,
  onScrollPx,
  onToggle,
  onUseSuggestion
}: Props): React.JSX.Element | null {
  if (!open) return null

  const isPage = mode === 'page'
  const suggestion = isPage ? suggestedPage : suggestedScroll

  return (
    <div className="sheet-wrap open" onClick={onClose}>
      <div className="sheet auto-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="auto-head">
          <span>{isPage ? '自动翻页' : '自动滚动'}</span>
          <span className="auto-hint">
            {isPage ? '每 ' + pageSec.toFixed(1) + ' 秒翻一页' : Math.round(scrollPx) + ' 像素/秒'}
          </span>
        </div>

        <div className="set-row">
          <span className="set-label">{isPage ? '速度' : '速度'}</span>
          <div className="stepper">
            <button
              type="button"
              onClick={() => (isPage ? onPageSec(Math.max(2, Number((pageSec - 0.5).toFixed(1)))) : onScrollPx(Math.max(8, scrollPx - 4)))}
            >
              −
            </button>
            <span className="value">{isPage ? pageSec.toFixed(1) : Math.round(scrollPx)}</span>
            <button
              type="button"
              onClick={() => (isPage ? onPageSec(Math.min(120, Number((pageSec + 0.5).toFixed(1)))) : onScrollPx(Math.min(200, scrollPx + 4)))}
            >
              +
            </button>
          </div>
          <button type="button" className="auto-suggest" onClick={onUseSuggestion}>
            用我的阅读速度
            {suggestion ? `${isPage ? `（${suggestion.toFixed(1)} 秒）` : `（${Math.round(suggestion)}）`}` : ''}
          </button>
        </div>

        <div className="auto-actions">
          <button type="button" className={running ? 'danger' : 'primary'} onClick={onToggle}>
            {running ? '停止' : '开始'}
          </button>
        </div>
        <p className="auto-note">
          推荐速度按你最近几次手动翻页/滚动的节奏再放慢 10%，随时可以微调。
        </p>
      </div>
    </div>
  )
}
