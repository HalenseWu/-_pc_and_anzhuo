import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useLibrary } from '../stores/library'
import { useReader, type FontId, type PageAnim, type ReadingMode, type ThemeId } from '../stores/reader'

const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'paper', label: '宣纸' },
  { id: 'sepia', label: '米黄' },
  { id: 'green', label: '青绿' },
  { id: 'night', label: '夜间' },
  { id: 'black', label: '纯黑' }
]

const FONTS: { id: FontId; label: string }[] = [
  { id: 'serif', label: '宋体' },
  { id: 'kai', label: '楷体' },
  { id: 'sans', label: '黑体' }
]

const MODES: { id: ReadingMode; label: string }[] = [
  { id: 'page', label: '分页' },
  { id: 'scroll', label: '上下滚动' }
]

const ANIMS: { id: PageAnim; label: string }[] = [
  { id: 'slide', label: '平移' },
  { id: 'cover', label: '覆盖' },
  { id: 'fade', label: '淡入' },
  { id: 'none', label: '无' }
]

export function AppSettings(): React.JSX.Element | null {
  const open = useLibrary((state) => state.settingsOpen)
  const setOpen = useLibrary((state) => state.setSettingsOpen)
  const settings = useReader((state) => state.settings)
  const update = useReader((state) => state.updateSettings)
  const [dir, setDir] = useState('')
  const [backupNote, setBackupNote] = useState<string | null>(null)

  const doBackup = async (action: 'export' | 'import'): Promise<void> => {
    setBackupNote(action === 'export' ? '正在打包…' : '正在导入…')
    try {
      if (action === 'export') {
        const result = await window.wuya?.backup.export()
        setBackupNote(result ? `已导出到 ${result.path}` : '已取消')
      } else {
        const result = await window.wuya?.backup.import()
        if (!result) {
          setBackupNote('已取消')
          return
        }
        await useLibrary.getState().load()
        setBackupNote(`导入完成：新增 ${result.added} 本，已存在 ${result.skipped} 本`)
      }
    } catch (issue) {
      setBackupNote(issue instanceof Error ? issue.message : String(issue))
    }
    window.setTimeout(() => setBackupNote(null), 4000)
  }

  useEffect(() => {
    if (!open) return
    void window.wuya?.library.dataDir().then((value) => setDir(value))
  }, [open])

  if (!open) return null

  return (
    <div className="set-mask" onClick={() => setOpen(false)}>
      <div className="set-panel" onClick={(event) => event.stopPropagation()}>
        <div className="set-head">
          <span>设置</span>
          <button className="set-x" type="button" onClick={() => setOpen(false)}>
            <Icon id="i-x" size={14} />
          </button>
        </div>

        <div className="set-body">
          <div className="set-group">阅读默认</div>

          <div className="set-row">
            <span className="set-label">主题</span>
            <div className="set-seg">
              {THEMES.map((item) => (
                <button
                  key={item.id}
                  className={settings.theme === item.id ? 'on' : ''}
                  type="button"
                  onClick={() => update({ theme: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <span className="set-label">字体</span>
            <div className="set-seg">
              {FONTS.map((item) => (
                <button
                  key={item.id}
                  className={settings.font === item.id ? 'on' : ''}
                  type="button"
                  onClick={() => update({ font: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <span className="set-label">字号</span>
            <input
              className="set-range"
              type="range"
              min={16}
              max={30}
              step={1}
              value={settings.fontSize}
              onChange={(event) => update({ fontSize: Number(event.target.value) })}
            />
            <b>{settings.fontSize}px</b>
          </div>

          <div className="set-row">
            <span className="set-label">翻页</span>
            <div className="set-seg">
              {MODES.map((item) => (
                <button
                  key={item.id}
                  className={settings.mode === item.id ? 'on' : ''}
                  type="button"
                  onClick={() => update({ mode: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <span className="set-label">动画</span>
            <div className="set-seg">
              {ANIMS.map((item) => (
                <button
                  key={item.id}
                  className={settings.animation === item.id ? 'on' : ''}
                  type="button"
                  onClick={() => update({ animation: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <span className="set-label">版式</span>
            <div className="set-seg">
              <button
                className={!settings.spread ? 'on' : ''}
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

          <div className="set-group">数据</div>
          <div className="set-row column">
            <span className="set-label">书库目录</span>
            <div className="set-path">{dir}</div>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => void window.wuya?.library.openDataDir()}
            >
              打开目录
            </button>
          </div>

          <div className="set-row column">
            <span className="set-label">备份与恢复</span>
            <div className="set-path">导出 .wuya 包，可在手机版或另一台电脑导入</div>
            <div className="set-actions">
              <button className="btn-ghost" type="button" onClick={() => void doBackup('export')}>
                导出备份
              </button>
              <button className="btn-ghost" type="button" onClick={() => void doBackup('import')}>
                导入备份
              </button>
            </div>
            {backupNote ? <div className="set-note">{backupNote}</div> : null}
          </div>

          <div className="set-group">关于</div>
          <div className="set-about">
            无涯 0.2.0 · 本地阅读，不上传任何文件
            <br />
            支持 TXT / EPUB / PDF，书签、笔记、全库搜索、目录校正
          </div>
        </div>
      </div>
    </div>
  )
}
