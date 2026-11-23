import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import type { TtsConfig, TtsStatus } from '../shared/types'

const DEFAULTS: TtsConfig = {
  engine: 'gpt-sovits',
  host: 'http://127.0.0.1',
  port: 9880,
  gsvRoot: '',
  gptWeights: '',
  sovitsWeights: '',
  refAudio: '',
  promptText: '',
  promptLang: 'zh',
  textLang: 'zh',
  sapiVoice: '',
  autoStart: true
}

/* 常见安装位置，首次启动时自动带上 */
const CANDIDATE_ROOTS = [
  'E:\\AI\\GPT-SoVITS-v5-20261005\\GPT-SoVITS-v2pro-20261006',
  'D:\\GPT-SoVITS',
  'E:\\GPT-SoVITS'
]

const CANDIDATE_REF_DIRS = [
  'E:\\AI翻唱\\AI双笙\\特选参考音频\\人声',
  'E:\\AI翻唱\\AI双笙\\参考音频'
]
/* 实测：这段参考音频偏闷（高频占比低），合成出来会发闷；默认改用明亮的片段 */
const BRIGHT_REF = '双笙001.wav'
const CURATED_REF_PROMPT =
  '但是我觉得，首先，如果你要从这种状态出来的话，第一步可以先尝试着去不要把他当成一个'
const OLD_SONG_REF = '双笙_陈元汐小满.mp3.reformatted_vocals.flac_0006800960_0006996160.wav'
const DULL_REF = '原生声音合集001.mp3_0004915520_0005072000.wav'
/* 推荐片段对应的文字（用户提供） */
const BRIGHT_REF_PROMPT = CURATED_REF_PROMPT

function pickCandidate(): Partial<TtsConfig> {
  const root = CANDIDATE_ROOTS.find((value) => existsSync(join(value, 'api_v2.py')))
  if (!root) return {}
  const gptDir = join(root, 'GPT_weights_v2ProPlus')
  const sovitsDir = join(root, 'SoVITS_weights_v2ProPlus')
  const gpt = existsSync(join(gptDir, '双笙001-e15.ckpt'))
    ? join(gptDir, '双笙001-e15.ckpt')
    : ''
  const sovits = existsSync(join(sovitsDir, '双笙001_e8_s352.pth'))
    ? join(sovitsDir, '双笙001_e8_s352.pth')
    : ''
  const refDir = CANDIDATE_REF_DIRS.find((value) => existsSync(value))
  const bright = refDir ? join(refDir, BRIGHT_REF) : ''
  const dull = refDir ? join(refDir, DULL_REF) : ''
  const ref = bright && existsSync(bright) ? bright : dull
  return {
    gsvRoot: root,
    gptWeights: gpt,
    sovitsWeights: sovits,
    refAudio: existsSync(ref) ? ref : '',
    ...(ref && existsSync(ref) && ref.endsWith(BRIGHT_REF) ? { promptText: BRIGHT_REF_PROMPT } : {})
  }
}

export class TtsManager {
  private readonly file: string
  private config: TtsConfig
  private child: ChildProcess | null = null
  private ready = false
  private message = '未启动'
  private starting: Promise<TtsStatus> | null = null
  private infoCache = new Map<string, { duration: number | null; brightness: number | null }>()

  constructor(private readonly root: string) {
    this.file = join(root, 'tts.json')
    this.config = this.load()
    const curatedDir = CANDIDATE_REF_DIRS[0]
    const curated = join(curatedDir, BRIGHT_REF)
    const oldPair =
      this.config.promptText.includes('暮景斜阳') ||
      this.config.refAudio.includes('AI双笙\\参考音频')
    const staleRef =
      !this.config.refAudio ||
      !existsSync(this.config.refAudio) ||
      this.config.refAudio.endsWith(OLD_SONG_REF) ||
      this.config.refAudio.endsWith('双笙_陈元汐小满.mp3.reformatted_vocals.flac_0006800960_0006996160.wav') ||
      oldPair
    if (staleRef && existsSync(curated)) {
      this.config.refAudio = curated
      this.config.promptText = CURATED_REF_PROMPT
      try {
        writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8')
      } catch {
        /* 忽略 */
      }
    } else if (
      this.config.refAudio.endsWith(BRIGHT_REF) &&
      (!this.config.promptText.trim() || this.config.promptText.includes('暮景斜阳'))
    ) {
      this.config.promptText = CURATED_REF_PROMPT
      try {
        writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8')
      } catch {
        /* 忽略 */
      }
    }
    if (this.config.refAudio.endsWith(BRIGHT_REF) && !this.config.promptText.trim()) {
      this.config.promptText = BRIGHT_REF_PROMPT
      try {
        writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8')
      } catch {
        /* 忽略 */
      }
    }
    if (this.config.refAudio.endsWith(DULL_REF)) {
      const refDir = CANDIDATE_REF_DIRS.find((value) => existsSync(value))
      const bright = refDir ? join(refDir, BRIGHT_REF) : ''
      if (bright && existsSync(bright)) {
        this.config.refAudio = bright
        try {
          writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8')
        } catch {
          /* 忽略 */
        }
      }
    }
  }

  private load(): TtsConfig {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf-8')) as Partial<TtsConfig>
      return { ...DEFAULTS, ...pickCandidate(), ...raw }
    } catch {
      const seeded = { ...DEFAULTS, ...pickCandidate() }
      try {
        writeFileSync(this.file, JSON.stringify(seeded, null, 2), 'utf-8')
      } catch {
        /* 目录不可写时忽略 */
      }
      return seeded
    }
  }

  getConfig(): TtsConfig {
    return { ...this.config }
  }

  setConfig(patch: Partial<TtsConfig>): TtsConfig {
    this.config = { ...this.config, ...patch }
    writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8')
    return this.getConfig()
  }

  status(): TtsStatus {
    return {
      running: !!this.child && !this.child.killed,
      ready: this.ready,
      message: this.message
    }
  }

  private base(): string {
    return `${this.config.host.replace(/\/+$/, '')}:${this.config.port}`
  }

  private async waitReady(timeoutMs: number): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      try {
        const response = await fetch(`${this.base()}/docs`, { method: 'GET' })
        if (response.ok) return
      } catch {
        /* 还没起来 */
      }
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    throw new Error('朗读服务启动超时（120 秒）')
  }

  private async applyWeights(): Promise<void> {
    const jobs: [string, string][] = []
    if (this.config.gptWeights) jobs.push(['set_gpt_weights', this.config.gptWeights])
    if (this.config.sovitsWeights) jobs.push(['set_sovits_weights', this.config.sovitsWeights])
    for (const [endpoint, path] of jobs) {
      const response = await fetch(`${this.base()}/${endpoint}?weights_path=${encodeURIComponent(path)}`)
      if (!response.ok) throw new Error(`加载权重失败：${basename(path)}`)
      const body = (await response.json()) as { message?: string }
      if (body.message && body.message !== 'success') {
        throw new Error(`加载权重失败：${body.message}`)
      }
    }
  }

  async start(): Promise<TtsStatus> {
    if (this.ready) return this.status()
    if (this.starting) return this.starting
    this.starting = this.doStart().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async doStart(): Promise<TtsStatus> {
    const { gsvRoot, port } = this.config
    if (!gsvRoot || !existsSync(join(gsvRoot, 'api_v2.py'))) {
      this.message = '未找到 GPT-SoVITS 目录（缺少 api_v2.py）'
      return this.status()
    }
    const python = join(gsvRoot, 'runtime', 'python.exe')
    if (!existsSync(python)) {
      this.message = '未找到 runtime\\python.exe'
      return this.status()
    }

    this.message = '正在启动朗读服务…'
    this.child = spawn(python, [join(gsvRoot, 'api_v2.py'), '-a', '127.0.0.1', '-p', String(port)], {
      cwd: gsvRoot,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      windowsHide: true
    })
    this.child.on('exit', () => {
      this.child = null
      this.ready = false
      if (this.message === '就绪') this.message = '服务已退出'
    })

    try {
      await this.waitReady(120000)
      this.message = '正在加载权重…'
      await this.applyWeights()
      this.ready = true
      this.message = '就绪'
    } catch (error) {
      this.ready = false
      this.message = error instanceof Error ? error.message : String(error)
    }
    return this.status()
  }

  stop(): TtsStatus {
    if (this.child) {
      this.child.kill()
      this.child = null
    }
    this.ready = false
    this.message = '已停止'
    return this.status()
  }

  /** 参考音频先做响度归一化（参考太轻会让合成出来又小又闷） */
  private async prepareRef(): Promise<string> {
    const source = this.config.refAudio
    if (!source || !existsSync(source)) return source
    const stamp = String(existsSync(source) ? statSync(source).mtimeMs : Date.now())
    const target = join(this.root, 'tts-ref-normalized.wav')
    const marker = join(this.root, 'tts-ref-normalized.json')
    try {
      const meta = JSON.parse(readFileSync(marker, 'utf-8')) as { source?: string; stamp?: string }
      if (meta.source === source && meta.stamp === stamp && existsSync(target)) return target
    } catch {
      /* 需要重新生成 */
    }
    const ffmpeg = existsSync(join(this.config.gsvRoot, 'runtime', 'ffmpeg.exe'))
      ? join(this.config.gsvRoot, 'runtime', 'ffmpeg.exe')
      : 'ffmpeg'
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpeg,
        ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '32000', '-ac', '1', target],
        { windowsHide: true, timeout: 30000 },
        (error) => (error ? reject(error) : resolve())
      )
    })
    writeFileSync(marker, JSON.stringify({ source, stamp }), 'utf-8')
    return target
  }

  async synthesize(text: string, speed: number): Promise<Uint8Array> {
    if (this.config.engine === 'sapi') return this.speakSapi(text, speed)
    if (!this.ready) await this.start()
    if (!this.ready) throw new Error(this.message || '朗读服务未就绪')

    const refPath = await this.prepareRef().catch(() => this.config.refAudio)
    const response = await fetch(`${this.base()}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        text_lang: this.config.textLang,
        ref_audio_path: refPath,
        prompt_text: this.config.promptText,
        prompt_lang: this.config.promptLang,
        text_split_method: 'cut5',
        speed_factor: 1,
        media_type: 'wav',
        streaming_mode: false
      })
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`合成失败（${response.status}）${detail.slice(0, 120)}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  private async speakSapi(text: string, speed: number): Promise<Uint8Array> {
    const dir = mkdtempSync(join(tmpdir(), 'wuya-tts-'))
    const wav = join(dir, 'out.wav')
    const txt = join(dir, 'in.txt')
    writeFileSync(txt, text, 'utf-8')
    const rate = Math.max(-10, Math.min(10, Math.round((speed - 1) * 10)))
    const voice = this.config.sapiVoice
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      voice ? `$s.SelectVoice('${voice.replace(/'/g, "''")}')` : '',
      `$s.Rate = ${rate}`,
      `$s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}')`,
      `$s.Speak([IO.File]::ReadAllText('${txt.replace(/'/g, "''")}', [Text.Encoding]::UTF8))`,
      '$s.Dispose()'
    ]
      .filter(Boolean)
      .join('; ')

    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', script],
          { windowsHide: true, timeout: 30000 },
          (error) => (error ? reject(error) : resolve())
        )
      })
      return new Uint8Array(readFileSync(wav))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  async listVoices(): Promise<string[]> {
    const script =
      'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }'
    try {
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', script],
          { windowsHide: true, timeout: 15000, encoding: 'utf8' },
          (error, stdout) => (error ? reject(error) : resolve(stdout))
        )
      })
      return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    } catch {
      return []
    }
  }

  private async ffmpegRms(path: string, highpass: boolean): Promise<number | null> {
    const ffmpeg = existsSync(join(this.config.gsvRoot, 'runtime', 'ffmpeg.exe'))
      ? join(this.config.gsvRoot, 'runtime', 'ffmpeg.exe')
      : 'ffmpeg'
    const filter = highpass ? 'highpass=f=3000,astats=metadata=0:reset=0' : 'astats=metadata=0:reset=0'
    try {
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          ffmpeg,
          ['-hide_banner', '-nostats', '-i', path, '-af', filter, '-f', 'null', '-'],
          { windowsHide: true, timeout: 20000, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
          (error, stdout, stderr) => (error && !stderr ? reject(error) : resolve(stderr || stdout))
        )
      })
      const match = output.match(/RMS level dB:\s*(-?[\d.]+)/)
      return match ? Number(match[1]) : null
    } catch {
      return null
    }
  }

  /** 推荐的明亮参考音频（不存在则 null） */
  suggestRef(): string | null {
    const dir = CANDIDATE_REF_DIRS.find((value) => existsSync(value))
    if (!dir) return null
    const path = join(dir, BRIGHT_REF)
    return existsSync(path) ? path : null
  }

  /** 参考音频信息：时长 + 高频占比（相对总 RMS 的 dB，越高越明亮） */
  async audioInfo(path: string): Promise<{ duration: number | null; brightness: number | null }> {
    const cached = this.infoCache.get(path)
    if (cached) return cached
    const duration = await this.audioDuration(path)
    const total = await this.ffmpegRms(path, false)
    const high = await this.ffmpegRms(path, true)
    const brightness = total !== null && high !== null ? Math.round((high - total) * 10) / 10 : null
    const result = { duration, brightness }
    this.infoCache.set(path, result)
    return result
  }

  /** 参考音频时长（秒），失败返回 null */
  async audioDuration(path: string): Promise<number | null> {
    const ffprobe = join(this.config.gsvRoot, 'runtime', 'ffprobe.exe')
    const probe = existsSync(ffprobe) ? ffprobe : 'ffprobe'
    try {
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          probe,
          ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
          { windowsHide: true, timeout: 15000, encoding: 'utf8' },
          (error, stdout) => (error ? reject(error) : resolve(stdout))
        )
      })
      const value = Number(output.trim())
      return Number.isFinite(value) ? value : null
    } catch {
      return null
    }
  }

  dispose(): void {
    this.stop()
  }
}
