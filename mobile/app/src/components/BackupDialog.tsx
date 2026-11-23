import { useState } from 'react'
import { backupFileName, exportBackup, importBackup } from '../core/backup'
import { pickBackupFile, shareBackup } from '../platform/backup-io'
import { useLibrary } from '../store/library'
import { useStats } from '../store/stats'

export function BackupDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const books = useLibrary((state) => state.books)
  const [busy, setBusy] = useState<string | null>(null)

  if (!open) return null

  const doExport = async (): Promise<void> => {
    setBusy('正在打包…')
    try {
      const blob = await exportBackup({ library: books, stats: useStats.getState().file })
      await shareBackup(blob, backupFileName())
      useLibrary.setState({ error: null })
    } catch (issue) {
      useLibrary.setState({ error: issue instanceof Error ? issue.message : String(issue) })
    } finally {
      setBusy(null)
    }
  }

  const doImport = (): void => {
    pickBackupFile((file) => {
      setBusy('正在导入…')
      void importBackup(file)
        .then(async (result) => {
          await useLibrary.getState().load()
          await useStats.getState().load()
          setBusy(null)
          onClose()
          useLibrary.setState({
            error: `导入完成：新增 ${result.added} 本，已存在 ${result.skipped} 本`
          })
        })
        .catch((issue: unknown) => {
          setBusy(null)
          useLibrary.setState({ error: issue instanceof Error ? issue.message : String(issue) })
        })
    })
  }

  return (
    <div className="dialog-scrim" onClick={() => (busy ? undefined : onClose())}>
      <div className="dialog" onClick={(event) => event.stopPropagation()}>
        <h3>备份与恢复</h3>
        <p>导出的 .wuya 包包含书架、正文、书签、笔记和阅读时长，电脑版和手机版都能导入。</p>
        <div className="backup-actions">
          <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void doExport()}>
            导出备份
          </button>
          <button type="button" disabled={Boolean(busy)} onClick={doImport}>
            导入备份
          </button>
        </div>
        {busy ? <p className="backup-busy">{busy}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
