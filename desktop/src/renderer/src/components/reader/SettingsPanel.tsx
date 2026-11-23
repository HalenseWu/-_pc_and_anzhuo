import { Icon } from '../Icon'
import { DEFAULT_SETTINGS, useReader, type FontId, type ThemeId } from '../../stores/reader'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

const THEMES: { id: ThemeId; color: string; label: string }[] = [
  { id: 'paper', color: '#F7F3EA', label: '宣纸' },
  { id: 'sepia', color: '#F3E7CF', label: '米黄' },
  { id: 'green', color: '#DCE8D5', label: '护眼' },
  { id: 'night', color: '#1B1E23', label: '夜间' },
  { id: 'black', color: '#000000', label: '纯黑' }
]

const FONTS: { id: FontId; label: string }[] = [
  { id: 'serif', label: '宋体' },
  { id: 'kai', label: '楷体' },
  { id: 'sans', label: '黑体' }
]

const WIDTHS = [560, 640, 720, 800, 900]

export function SettingsPanel({ open, onClose }: SettingsPanelProps): React.JSX.Element {
  const settings = useReader((state) => state.settings)
  const update = useReader((state) => state.updateSettings)

  return (
    <div className={`set ${open ? 'open' : ''}`}>
      <div className="set-head">
        <h3>阅读设置</h3>
        <button className="reset" type="button" onClick={() => update(DEFAULT_SETTINGS)}>
          恢复默认
        </button>
        <button className="x" type="button" onClick={onClose}>
          <Icon id="i-x" size={12} />
        </button>
      </div>

      <div className="set-row">
        <div className="set-label">主题</div>
        <div className="set-ctl">
          <div className="theme-dots">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                className={`td ${settings.theme === theme.id ? 'on' : ''}`}
                style={{ background: theme.color }}
                title={theme.label}
                type="button"
                onClick={() => update({ theme: theme.id })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">字体</div>
        <div className="set-ctl">
          <div className="seg">
            {FONTS.map((font) => (
              <button
                key={font.id}
                className={settings.font === font.id ? 'on' : ''}
                type="button"
                onClick={() => update({ font: font.id })}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">字号</div>
        <div className="set-ctl">
          <div className="step">
            <button type="button" onClick={() => update({ fontSize: Math.max(14, settings.fontSize - 1) })}>
              A−
            </button>
            <div className="val">{Math.round(settings.fontSize)}</div>
            <button type="button" onClick={() => update({ fontSize: Math.min(30, settings.fontSize + 1) })}>
              A+
            </button>
          </div>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">行高</div>
        <div className="set-ctl">
          <input
            className="range"
            type="range"
            min={1.5}
            max={2.4}
            step={0.05}
            value={settings.lineHeight}
            onChange={(event) => update({ lineHeight: Number(event.target.value) })}
          />
          <div className="sv">{settings.lineHeight.toFixed(2)}</div>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">段距</div>
        <div className="set-ctl">
          <input
            className="range"
            type="range"
            min={0.2}
            max={1.6}
            step={0.05}
            value={settings.paragraphGap}
            onChange={(event) => update({ paragraphGap: Number(event.target.value) })}
          />
          <div className="sv">{settings.paragraphGap.toFixed(2)}</div>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">翻页</div>
        <div className="set-ctl">
          <div className="seg">
            <button
              className={settings.mode === 'page' ? 'on' : ''}
              type="button"
              onClick={() => update({ mode: 'page' })}
            >
              分页
            </button>
            <button
              className={settings.mode === 'scroll' ? 'on' : ''}
              type="button"
              onClick={() => update({ mode: 'scroll' })}
            >
              滚动
            </button>
          </div>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">翻页动画</div>
        <div className="set-ctl">
          <div className="seg">
            <button
              className={settings.animation === 'slide' ? 'on' : ''}
              type="button"
              onClick={() => update({ animation: 'slide' })}
            >
              平移
            </button>
            <button
              className={settings.animation === 'cover' ? 'on' : ''}
              type="button"
              onClick={() => update({ animation: 'cover' })}
            >
              覆盖
            </button>
            <button
              className={settings.animation === 'fade' ? 'on' : ''}
              type="button"
              onClick={() => update({ animation: 'fade' })}
            >
              淡入
            </button>
            <button
              className={settings.animation === 'none' ? 'on' : ''}
              type="button"
              onClick={() => update({ animation: 'none' })}
            >
              无
            </button>
          </div>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">版式</div>
        <div className="set-ctl">
          <div className="seg">
            <button
              className={settings.spread ? '' : 'on'}
              type="button"
              onClick={() => update({ spread: false })}
            >
              单页
            </button>
            <button
              className={settings.spread ? 'on' : ''}
              type="button"
              onClick={() => update({ spread: true })}
            >
              双页对开
            </button>
          </div>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">页宽</div>
        <div className="set-ctl">
          <div className="seg">
            {WIDTHS.map((width) => (
              <button
                key={width}
                className={settings.pageWidth === width ? 'on' : ''}
                type="button"
                onClick={() => update({ pageWidth: width })}
              >
                {width}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="set-note">设置实时生效、全局保存。← → 翻页，空格滚动，M 切换分页/滚动，Esc 退出。双页对开会按窗口自动收窄页宽。</div>
    </div>
  )
}
