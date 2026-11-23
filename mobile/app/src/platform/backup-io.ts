import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { bytesToBase64 } from './storage'

/** 导出：原生写到缓存目录再调系统分享；浏览器直接下载 */
export async function shareBackup(blob: Blob, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const written = await Filesystem.writeFile({
      path: fileName,
      directory: Directory.Cache,
      data: bytesToBase64(bytes),
      recursive: true
    })
    await Share.share({
      title: '无涯备份',
      text: fileName,
      url: written.uri,
      dialogTitle: '保存或发送备份'
    })
    return
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** 选择备份文件 */
export function pickBackupFile(onPick: (file: File) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.wuya,.zip,application/zip'
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) onPick(file)
  }
  input.click()
}
