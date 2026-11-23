import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import { useReader } from '../../stores/reader'
import { SPEEDS, useTts } from '../../stores/tts'

interface TtsPanelProps {
  open: boolean
  onClose: () => void
  getStartBlock: () => number
}

function shortName(path: string): string {
  if (!path) return '未选择'
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export function TtsPanel({ open, onClose, getStartBlock }: TtsPanelProps): React.JSX.Element {
  const chapter = useReader((state) => state.chapter)
  const config = useTts((state) => state.config)
  const status = useTts((state) => state.status)
  const playing = useTts((state) => state.playing)
  const paused = useTts((state) => state.paused)
  const speaking = useTts((state) => state.speaking)
  const error = useTts((state) => state.error)
  const speed = useTts((state) => state.speed)
  const load = useTts((state) => state.load)
  const patch = useTts((state) => state.patch)
  const startService = useTts((state) => state.startService)
  const stopService = useTts((state) => state.stopService)
  const testVoice = useTts((state) => state.testVoice)
  const setSpeed = useTts((state) => state.setSpeed)
  const follow = useTts((state) => state.follow)
  const setFollow = useTts((state) => state.setFollow)
  const readFrom = useTts((state) => state.readFrom)
  const pause = useTts((state) => state.pause)
  const resume = useTts((state) => state.resume)
  const stop = useTts((state) => state.stop)

  const [voices, setVoices] = useState<string[]>([])
  const refreshStatus = useTts((state) => state.refreshStatus)
  const [refInfo, setRefInfo] = useState<{ duration: number | null; brightness: number | null } | null>(null)

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => void refreshStatus(), 3000)
    return () => window.clearInterval(timer)
  }, [open, refreshStatus])

  useEffect(() => {
    if (!open || config?.engine !== 'sapi') return
    void window.wuya?.tts.voices().then((list) => {
      setVoices(list)
      if (!config?.sapiVoice && list.length > 0) {
        const chinese = list.find((voice) => /Huihui|Chinese|中文/i.test(voice))
        void patch({ sapiVoice: chinese ?? list[0] })
      }
    })
  }, [open, config?.engine])

  useEffect(() => {
    if (!config?.refAudio) {
      setRefInfo(null)
      return
    }
    void window.wuya?.tts.audioInfo(config.refAudio).then((value) => setRefInfo(value))
  }, [config?.refAudio])

  const brightness = refInfo?.brightness ?? null
  const dull = brightness !== null && brightness < -24
  const brightnessText =
    brightness === null ? '' : brightness > -18 ? '明亮' : brightness > -24 ? '一般' : '偏闷'

  const pick = async (kind: 'root' | 'gpt' | 'sovits' | 'ref'): Promise<void> => {
    const path = await window.wuya?.tts.pick(kind)
    if (!path) return
    if (kind === 'root') await patch({ gsvRoot: path })
    if (kind === 'gpt') await patch({ gptWeights: path })
    if (kind === 'sovits') await patch({ sovitsWeights: path })
    if (kind === 'ref') await patch({ refAudio: path })
  }

  const previewRef = async (): Promise<void> => {
    if (!config?.refAudio) return
    const data = await window.wuya?.tts.readAudio(config.refAudio)
    if (!data) return
    const url = URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: 'audio/wav' }))
    const audio = new Audio(url)
    audio.onended = () => URL.revokeObjectURL(url)
    void audio.play()
  }

  const startReading = (): void => {
    readFrom(getStartBlock())
  }

  return (
    <div className={`set tts ${open ? 'open' : ''}`}>
      <div className="set-head">
        <h3>朗读</h3>
        <button className="x" type="button" onClick={onClose}>
          <Icon id="i-x" size={12} />
        </button>
      </div>

      <div className="set-row">
        <div className="set-label">引擎</div>
        <div className="set-ctl">
          <div className="seg">
            <button
              className={config?.engine !== 'sapi' ? 'on' : ''}
              type="button"
              onClick={() => void patch({ engine: 'gpt-sovits' })}
            >
              GPT-SoVITS
            </button>
            <button
              className={config?.engine === 'sapi' ? 'on' : ''}
              type="button"
              onClick={() => void patch({ engine: 'sapi' })}
            >
              系统语音
            </button>
          </div>
        </div>
      </div>

      {config?.engine !== 'sapi' ? (
        <>
          <div className="set-row">
            <div className="set-label">服务</div>
            <div className="set-ctl tts-status">
              <span className={`dot ${status?.ready ? 'ok' : status?.running ? 'busy' : ''}`} />
              <span className="tts-msg">{status?.message ?? '未启动'}</span>
              <button className="mini" type="button" onClick={() => void startService()}>
                启动
              </button>
              <button className="mini" type="button" onClick={() => void stopService()}>
                停止
              </button>
            </div>
          </div>

          <div className="set-row">
            <div className="set-label">目录</div>
            <div className="set-ctl">
              <button className="path" type="button" onClick={() => void pick('root')}>
                {shortName(config?.gsvRoot ?? '')}
              </button>
            </div>
          </div>
          <div className="set-row">
            <div className="set-label">GPT</div>
            <div className="set-ctl">
              <button className="path" type="button" onClick={() => void pick('gpt')}>
                {shortName(config?.gptWeights ?? '')}
              </button>
            </div>
          </div>
          <div className="set-row">
            <div className="set-label">SoVITS</div>
            <div className="set-ctl">
              <button className="path" type="button" onClick={() => void pick('sovits')}>
                {shortName(config?.sovitsWeights ?? '')}
              </button>
            </div>
          </div>
          <div className="set-row">
            <div className="set-label">参考音频</div>
            <div className="set-ctl tts-ref">
              <button className="path" type="button" onClick={() => void pick('ref')}>
                {shortName(config?.refAudio ?? '')}
              </button>
              <button className="mini" type="button" onClick={() => void previewRef()}>
                试听
              </button>
              <span className={`tts-dur ${dull ? 'dull' : ''}`}>
                {refInfo?.duration ? `${refInfo.duration.toFixed(1)}s` : ''}
                {refInfo?.duration && refInfo.duration > 12 ? ' 偏长' : ''}
                {brightnessText ? ` · ${brightnessText}` : ''}
              </span>
            </div>
          </div>
          {dull ? (
            <div className="tts-hint">
              这段参考音频偏闷，合成出来会发闷。
              <button
                className="mini"
                type="button"
                onClick={() => {
                  void window.wuya?.tts.suggestRef().then((path) => {
                    if (path) void patch({ refAudio: path })
                  })
                }}
              >
                换成明亮片段
              </button>
            </div>
          ) : null}
          <div className="set-row">
            <div className="set-label">参考文本</div>
            <div className="set-ctl">
              <input
                className="tts-input"
                value={config?.promptText ?? ''}
                placeholder="可留空"
                onChange={(event) => void patch({ promptText: event.target.value })}
              />
            </div>
          </div>
          <div className="tts-note">参考文本对应这段音频，填上能让音色和断句更稳</div>
        </>
      ) : (
        <div className="set-row">
          <div className="set-label">音色</div>
          <div className="set-ctl">
            <select
              className="tts-input"
              value={config?.sapiVoice ?? ''}
              onChange={(event) => void patch({ sapiVoice: event.target.value })}
            >
              <option value="">默认音色</option>
              {voices.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="set-row">
        <div className="set-label">语速</div>
        <div className="set-ctl">
          <div className="seg">
            {SPEEDS.map((value) => (
              <button
                key={value}
                className={speed === value ? 'on' : ''}
                type="button"
                onClick={() => setSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">跟随</div>
        <div className="set-ctl">
          <button
            className={`toggle ${follow ? 'on' : ''}`}
            type="button"
            onClick={() => setFollow(!follow)}
          >
            {follow ? '朗读时自动翻页 / 滚动' : '已关闭跟随'}
          </button>
        </div>
      </div>

      <div className="tts-actions">
        {playing ? (
          <>
            <button className="btn-solid" type="button" onClick={paused ? resume : pause}>
              {paused ? '继续' : '暂停'}
            </button>
            <button className="btn-ghost" type="button" onClick={stop}>
              停止
            </button>
          </>
        ) : (
          <button className="btn-solid" type="button" onClick={startReading}>
            从本页首段开始朗读
          </button>
        )}
        <button className="btn-ghost" type="button" onClick={() => void testVoice()}>
          测试音色
        </button>
      </div>

      {speaking ? <div className="tts-now">正在读：{speaking.text.slice(0, 26)}…</div> : null}
      {error ? <div className="tts-error">{error}</div> : null}
    </div>
  )
}
