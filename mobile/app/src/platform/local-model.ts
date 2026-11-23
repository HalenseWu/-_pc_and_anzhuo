import JSZip from 'jszip'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

const ROOT = 'tts/melo'
/** 模型文件可能是 model.onnx 或量化后的 model.int8.onnx */
const isModelFile = (name: string): boolean => name.toLowerCase().endsWith('.onnx')
const REQUIRED_ALWAYS = ['tokens.txt']

export interface LocalModelStatus {
  installed: boolean
  bytes: number
  missing: string[]
}

async function exists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ directory: Directory.Data, path })
    return true
  } catch {
    return false
  }
}

async function findModelFile(): Promise<string | null> {
  for (const name of ['model.int8.onnx', 'model.onnx']) {
    if (await exists(`${ROOT}/${name}`)) return name
  }
  try {
    const list = await Filesystem.readdir({ directory: Directory.Data, path: ROOT })
    const hit = list.files.find((entry) => isModelFile(entry.name))
    return hit ? hit.name : null
  } catch {
    return null
  }
}

export async function localModelStatus(): Promise<LocalModelStatus> {
  if (!Capacitor.isNativePlatform()) return { installed: false, bytes: 0, missing: ['model.onnx'] }
  const missing: string[] = []
  let bytes = 0
  const model = await findModelFile()
  if (!model) missing.push('model.onnx')
  for (const name of REQUIRED_ALWAYS) {
    if (!(await exists(`${ROOT}/${name}`))) missing.push(name)
  }
  for (const name of [...(model ? [model] : []), ...REQUIRED_ALWAYS]) {
    try {
      const stat = await Filesystem.stat({ directory: Directory.Data, path: `${ROOT}/${name}` })
      bytes += stat.size ?? 0
    } catch {
      /* 忽略 */
    }
  }
  return { installed: missing.length === 0, bytes, missing }
}

/** 导入音色包 zip：解压到 Data/tts/melo（兼容 zip 内多一层目录） */
export async function importLocalModel(file: File): Promise<{ ok: boolean; error?: string; bytes: number }> {
  if (!Capacitor.isNativePlatform()) return { ok: false, error: '仅安卓支持', bytes: 0 }
  try {
    const zip = await JSZip.loadAsync(file)
    /* Windows 打的包路径可能是反斜杠，统一成正斜杠 */
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => ({ entry, name: entry.name.replace(/\\/g, '/') }))
    const modelEntry = entries.find((item) => isModelFile(item.name))
    if (!modelEntry) {
      const names = entries.slice(0, 6).map((item) => item.name).join('、')
      return { ok: false, error: `压缩包里没找到 model.onnx（实际有：${names || '空包'}）`, bytes: 0 }
    }
    const prefix = modelEntry.name.slice(0, modelEntry.name.length - modelEntry.name.split('/').pop()!.length)

    /* 换音色包时先清空旧文件，避免新旧模型混在一起 */
    await removeLocalModel()

    /* 同目录下的所有文件都解出来（模型、tokens、lexicon、dict、fst） */
    let written = 0
    let count = 0
    for (const item of entries) {
      if (!item.name.startsWith(prefix)) continue
      const relative = item.name.slice(prefix.length)
      if (!relative || relative.endsWith('/')) continue
      if (relative.startsWith('.')) continue
      const data = await item.entry.async('base64')
      const target = `${ROOT}/${relative}`
      const slash = target.lastIndexOf('/')
      if (slash > 0) {
        await Filesystem.mkdir({
          directory: Directory.Data,
          path: target.slice(0, slash),
          recursive: true
        }).catch(() => undefined)
      }
      await Filesystem.writeFile({
        directory: Directory.Data,
        path: target,
        data,
        recursive: true
      })
      written += data.length
      count += 1
    }
    if (count === 0) return { ok: false, error: '压缩包里没有可导入的文件', bytes: 0 }
    return { ok: true, bytes: written }
  } catch (issue) {
    return { ok: false, error: issue instanceof Error ? issue.message : String(issue), bytes: 0 }
  }
}

export async function removeLocalModel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await Filesystem.rmdir({ directory: Directory.Data, path: ROOT, recursive: true })
  } catch {
    /* 忽略 */
  }
}
