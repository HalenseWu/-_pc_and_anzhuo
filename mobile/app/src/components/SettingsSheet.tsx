import { useEffect, useRef, useState } from 'react'
import { THEMES, useReader } from '../store/reader'
import { importLocalModel, localModelStatus, removeLocalModel } from '../platform/local-model'
import { prepareLocalEngine, setTtsEngine } from '../platform/tts'
import { localTtsOnImportProgress, localTtsPickImport } from '../platform/local-tts'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsSheet({ open, onClose }: Props): React.JSX.Element {
  const settings = useReader((state) => state.settings)
  const update = useReader((state) => state.updateSettings)
  const [awakeOpen, setAwakeOpen] = useState(false)
  const [awakeText, setAwakeText] = useState('')
  const presets = [0, 5, 10]
  const isCustom = settings.keepAwake > 0 && !presets.includes(settings.keepAwake)
  const [modelInfo, setModelInfo] = useState<{ installed: boolean; bytes: number } | null>(null)
  const [modelBusy, setModelBusy] = useState(false)
  const [modelNote, setModelNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void localModelStatus().then((status) => setModelInfo({ installed: status.installed, bytes: status.bytes }))
  }, [open])

  return (
    <div className={`sheet-wrap ${open ? 'open' : ''}`} onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-grip" />

        <div className="set-row">
          <span className="set-label">字号</span>
          <div className="stepper">
            <button type="button" onClick={() => update({ fontSize: Math.max(14, settings.fontSize - 1) })}>
              A-
            </button>
            <span className="value">{settings.fontSize}</span>
            <button type="button" onClick={() => update({ fontSize: Math.min(32, settings.fontSize + 1) })}>
              A+
            </button>
          </div>
          <span className="set-label">行距</span>
          <div className="stepper">
            <button type="button" onClick={() => update({ lineHeight: Math.max(1.4, Number((settings.lineHeight - 0.1).toFixed(1))) })}>
              −
            </button>
            <span className="value">{settings.lineHeight.toFixed(1)}</span>
            <button type="button" onClick={() => update({ lineHeight: Math.min(2.6, Number((settings.lineHeight + 0.1).toFixed(1))) })}>
              +
            </button>
          </div>
        </div>

        <div className="set-row">
          <span className="set-label">字体</span>
          <div className="seg">
            {(['serif', 'kai', 'sans'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={settings.fontId === id ? 'on' : ''}
                onClick={() => update({ fontId: id })}
              >
                {id === 'serif' ? '宋体' : id === 'kai' ? '楷体' : '黑体'}
              </button>
            ))}
          </div>
        </div>

        <div className="set-row">
          <span className="set-label">阅读</span>
          <div className="seg">
            <button
              type="button"
              className={settings.mode === 'page' ? 'on' : ''}
              onClick={() => update({ mode: 'page' })}
            >
              翻页
            </button>
            <button
              type="button"
              className={settings.mode === 'scroll' ? 'on' : ''}
              onClick={() => update({ mode: 'scroll' })}
            >
              滚动
            </button>
          </div>
        </div>

        <div className={`set-row ${settings.mode === 'scroll' ? 'locked' : ''}`}>
          <span className="set-label">翻页</span>
          <div className="seg">
            {(['slide', 'cover', 'fade', 'none'] as const).map((id) => (
              <button
                key={id}
                type="button"
                disabled={settings.mode === 'scroll'}
                className={settings.mode !== 'scroll' && settings.animation === id ? 'on' : ''}
                onClick={() => {
                  if (settings.mode === 'scroll') return
                  update({ animation: id })
                }}
              >
                {id === 'slide' ? '平移' : id === 'cover' ? '覆盖' : id === 'fade' ? '淡入' : '无'}
              </button>
            ))}
          </div>
          {settings.mode === 'scroll' ? <span className="lock">🔒 滚动模式用不到</span> : null}
        </div>

        <div className="set-row">
          <span className="set-label">音量键</span>
          <button
            type="button"
            className={"toggle " + (settings.volumeKeys ? "on" : "")}
            onClick={() => update({ volumeKeys: !settings.volumeKeys })}
          >
            {settings.volumeKeys ? "音量键翻页" : "关闭"}
          </button>
        </div>

        <div className="set-row">
          <span className="set-label">常亮</span>
          <div className="seg">
            {([0, 5, 10] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={settings.keepAwake === value ? 'on' : ''}
                onClick={() => update({ keepAwake: value })}
              >
                {value === 0 ? '关闭' : `${value} 分`}
              </button>
            ))}
            <button
              type="button"
              className={isCustom ? 'on' : ''}
              onClick={() => {
                setAwakeText(String(isCustom ? settings.keepAwake : 15))
                setAwakeOpen(true)
              }}
            >
              {isCustom ? `${settings.keepAwake} 分` : '自定义'}
            </button>
          </div>
        </div>

        <div className="set-row">
          <span className="set-label">朗读</span>
          <div className="seg">
            <button
              type="button"
              className={settings.ttsEngine === 'system' ? 'on' : ''}
              onClick={() => {
                setTtsEngine('system')
                update({ ttsEngine: 'system' })
              }}
            >
              系统语音
            </button>
            <button
              type="button"
              className={settings.ttsEngine === 'local' ? 'on' : ''}
              onClick={() => {
                setTtsEngine('local')
                update({ ttsEngine: 'local' })
                void prepareLocalEngine().then((result) => {
                  if (!result.ok) setModelNote(result.error ?? '本地音色未就绪')
                })
              }}
            >
              本地音色
            </button>
          </div>
        </div>

        <div className="set-row column">
          <span className="set-label">本地音色包 · v{__APP_VERSION__}</span>
          <div className="set-path">
            {modelBusy
              ? '处理中…'
              : modelInfo?.installed
                ? `已安装 ${Math.round((modelInfo.bytes ?? 0) / (1024 * 1024))} MB`
                : '未安装：导入 MeloTTS 音色包 zip 后即可离线朗读'}
          </div>
          <div className="set-actions">
            <button
              className="btn-ghost"
              type="button"
              disabled={modelBusy}
              onClick={() => {
                setModelBusy(true)
                setModelNote('请选择音色包 zip…')
                let stopProgress: (() => void) | null = null
                void localTtsOnImportProgress((payload) => {
                  setModelNote(`正在解压：${payload.files} 个文件 / ${payload.megabytes} MB`)
                }).then((off) => {
                  stopProgress = off
                })
                void localTtsPickImport()
                  .then(async (result) => {
                    if (!result.ok) {
                      setModelNote(result.error ?? '导入失败')
                      return
                    }
                    const status = await localModelStatus()
                    setModelInfo({ installed: status.installed, bytes: status.bytes })
                    const prepared = await prepareLocalEngine()
                    setModelNote(
                      prepared.ok
                        ? `已导入 ${result.files ?? 0} 个文件，音色包已就绪（预热 ${prepared.warmupMs ?? 0} ms）`
                        : (prepared.error ?? '已导入，但加载失败')
                    )
                  })
                  .finally(() => {
                    stopProgress?.()
                    setModelBusy(false)
                  })
              }}
            >
              导入音色包
            </button>
            <button
              className="btn-ghost"
              type="button"
              disabled={modelBusy || !modelInfo?.installed}
              onClick={() => {
                setModelBusy(true)
                void removeLocalModel()
                  .then(() => localModelStatus())
                  .then((status) => {
                    setModelInfo({ installed: status.installed, bytes: status.bytes })
                    setModelNote('已删除本地音色')
                  })
                  .finally(() => setModelBusy(false))
              }}
            >
              删除
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              setModelBusy(true)
              setModelNote('正在导入…')
              void importLocalModel(file)
                .then(async (result) => {
                  if (!result.ok) {
                    setModelNote(result.error ?? '导入失败')
                    return
                  }
                  const status = await localModelStatus()
                  setModelInfo({ installed: status.installed, bytes: status.bytes })
                  const prepared = await prepareLocalEngine()
                  setModelNote(
                    prepared.ok
                      ? `音色包已就绪（预热 ${prepared.warmupMs ?? 0} ms）`
                      : (prepared.error ?? '音色包已导入')
                  )
                })
                .finally(() => setModelBusy(false))
            }}
          />
          {modelNote ? <div className="set-note">{modelNote}</div> : null}
        </div>

        <div className="set-row themes">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`dot ${settings.theme === theme.id ? 'on' : ''}`}
              style={{ background: theme.paper, color: theme.text }}
              onClick={() => update({ theme: theme.id })}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      {awakeOpen ? (
        <div className="dialog-scrim" onClick={() => setAwakeOpen(false)}>
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
            <h3>常亮时长</h3>
            <p>3–30 分钟，期间没有翻页或滚动就会放开常亮，让屏幕按系统设置休眠。</p>
            <input
              className="dialog-input"
              inputMode="numeric"
              value={awakeText}
              onChange={(event) => setAwakeText(event.target.value.replace(/[^0-9]/g, ''))}
              autoFocus
            />
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setAwakeOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                disabled={Number(awakeText) < 3 || Number(awakeText) > 30}
                onClick={() => {
                  update({ keepAwake: Number(awakeText) })
                  setAwakeOpen(false)
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
