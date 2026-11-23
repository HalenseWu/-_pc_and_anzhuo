import { Icon } from './Icon'
import { WindowButtons } from './WindowButtons'
import { useLibrary } from '../stores/library'

export function TitleBar(): React.JSX.Element {
  const busy = useLibrary((state) => state.busy)
  const filter = useLibrary((state) => state.filter)
  const setFilter = useLibrary((state) => state.setFilter)
  const runLibrarySearch = useLibrary((state) => state.runLibrarySearch)
  const pickAndImport = useLibrary((state) => state.pickAndImport)

  return (
    <header className="tb">
      <div className="tb-l">
        <div className="seal">涯</div>
        <span className="app-name">无涯</span>
      </div>
      <div className="tb-r">
        <div className="search">
          <Icon id="i-search" size={14} />
          <input
            value={filter}
            placeholder="搜索书名、作者"
            title="输入后按回车，可在全库正文里搜索"
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runLibrarySearch(filter)
            }}
          />
        </div>
        <button className="btn-import" type="button" disabled={busy} onClick={() => void pickAndImport()}>
          <Icon id="i-plus" size={13} />
          {busy ? '导入中' : '导入'}
        </button>
        <WindowButtons />
      </div>
    </header>
  )
}
