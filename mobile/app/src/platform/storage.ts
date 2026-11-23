import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

const native = Capacitor.isNativePlatform()
const PREFIX = 'wuya:'

function key(path: string): string {
  return PREFIX + path
}

async function ensureDir(path: string): Promise<void> {
  if (!native) return
  const dir = path.split('/').slice(0, -1).join('/')
  if (!dir) return
  try {
    await Filesystem.mkdir({ path: dir, directory: Directory.Data, recursive: true })
  } catch {
    /* 已存在 */
  }
}

export async function readText(path: string): Promise<string | null> {
  if (native) {
    try {
      const result = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 })
      return typeof result.data === 'string' ? result.data : await result.data.text()
    } catch {
      return null
    }
  }
  return localStorage.getItem(key(path))
}

export async function writeText(path: string, data: string): Promise<void> {
  if (native) {
    await ensureDir(path)
    await Filesystem.writeFile({ path, directory: Directory.Data, data, encoding: Encoding.UTF8 })
    return
  }
  localStorage.setItem(key(path), data)
}

export async function readBytes(path: string): Promise<Uint8Array | null> {
  if (native) {
    try {
      const result = await Filesystem.readFile({ path, directory: Directory.Data })
      const base64 = typeof result.data === 'string' ? result.data : ''
      return base64ToBytes(base64)
    } catch {
      return null
    }
  }
  const raw = localStorage.getItem(key(path))
  return raw ? base64ToBytes(raw) : null
}

export async function writeBytes(path: string, data: Uint8Array): Promise<void> {
  const base64 = bytesToBase64(data)
  if (native) {
    await ensureDir(path)
    await Filesystem.writeFile({ path, directory: Directory.Data, data: base64 })
    return
  }
  localStorage.setItem(key(path), base64)
}

export async function remove(path: string): Promise<void> {
  if (native) {
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Data })
    } catch {
      /* 不存在 */
    }
    return
  }
  localStorage.removeItem(key(path))
}

export async function removeDir(path: string): Promise<void> {
  if (native) {
    try {
      await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true })
    } catch {
      /* 不存在 */
    }
    return
  }
  const prefix = key(path.endsWith('/') ? path : `${path}/`)
  Object.keys(localStorage)
    .filter((item) => item.startsWith(prefix))
    .forEach((item) => localStorage.removeItem(item))
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function readJson<T>(path: string): Promise<T | null> {
  const raw = await readText(path)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, JSON.stringify(value, null, 2))
}
