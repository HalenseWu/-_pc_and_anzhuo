import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useLibrary } from '../stores/library'

export function OrganizeDialog(): React.JSX.Element | null {
  const book = useLibrary((state) => state.organizing)
  const books = useLibrary((state) => state.books)
  const setOrganizing = useLibrary((state) => state.setOrganizing)
  const organize = useLibrary((state) => state.organize)

  const [group, setGroup] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!book) return
    setGroup(book.group ?? '')
    setTags(book.tags ?? [])
    setDraft('')
  }, [book?.id])

  if (!book) return null

  const groupOptions = [...new Set(books.map((item) => item.group?.trim()).filter((value): value is string => !!value))]
  const tagOptions = [...new Set(books.flatMap((item) => item.tags ?? []))].filter(
    (tag) => !tags.includes(tag)
  )

  const addTag = (value: string): void => {
    const tag = value.trim().replace(/\s+/g, ' ')
    if (!tag || tags.includes(tag)) {
      setDraft('')
      return
    }
    setTags([...tags, tag])
    setDraft('')
  }

  const save = (): void => {
    void organize(book.id, { group: group.trim() || null, tags })
  }

  return (
    <div className="org-mask" onClick={() => setOrganizing(null)}>
      <div className="org-panel" onClick={(event) => event.stopPropagation()}>
        <div className="org-head">
          <span>整理《{book.title}》</span>
          <button className="org-x" type="button" onClick={() => setOrganizing(null)}>
            <Icon id="i-x" size={13} />
          </button>
        </div>

        <div className="org-row">
          <span className="org-label">分组</span>
          <input
            className="org-input"
            value={group}
            list="wuya-groups"
            placeholder="例如：历史、待读、工作"
            onChange={(event) => setGroup(event.target.value)}
          />
          <datalist id="wuya-groups">
            {groupOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
        {groupOptions.length > 0 ? (
          <div className="org-suggest">
            {groupOptions.map((option) => (
              <button key={option} type="button" onClick={() => setGroup(option)}>
                {option}
              </button>
            ))}
            {group ? (
              <button type="button" className="muted" onClick={() => setGroup('')}>
                不分组
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="org-row column">
          <span className="org-label">标签</span>
          <div className="org-tags">
            {tags.length === 0 ? <span className="org-empty">还没有标签</span> : null}
            {tags.map((tag) => (
              <span className="org-tag" key={tag}>
                {tag}
                <button
                  type="button"
                  title="移除"
                  onClick={() => setTags(tags.filter((item) => item !== tag))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            className="org-input"
            value={draft}
            placeholder="输入标签后回车"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addTag(draft)
              }
            }}
          />
          {tagOptions.length > 0 ? (
            <div className="org-suggest">
              {tagOptions.slice(0, 10).map((tag) => (
                <button key={tag} type="button" onClick={() => addTag(tag)}>
                  + {tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="org-actions">
          <button className="btn-ghost" type="button" onClick={() => setOrganizing(null)}>
            取消
          </button>
          <button className="btn-solid" type="button" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
