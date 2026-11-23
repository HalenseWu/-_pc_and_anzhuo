import { useEffect, useState } from 'react'

export function WindowButtons(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const api = window.wuya
    if (!api) return
    void api.win.isMaximized().then(setMaximized)
    return api.win.onMaximized(setMaximized)
  }, [])

  const api = window.wuya

  return (
    <div className="winbtns">
      <button className="wb" type="button" title="最小化" onClick={() => api?.win.minimize()}>
        <span className="w-min" />
      </button>
      <button
        className="wb"
        type="button"
        title={maximized ? '还原' : '最大化'}
        onClick={() => api?.win.toggleMaximize()}
      >
        <span className="w-max" />
      </button>
      <button className="wb close" type="button" title="关闭" onClick={() => api?.win.close()}>
        <span className="w-close" />
      </button>
    </div>
  )
}
