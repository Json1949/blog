import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog.jsx'
import { MenuSelect } from './MenuSelect.jsx'

function dayLabel(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', { day: '2-digit' }).format(timestamp)
}

function FootIcon({ kind }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {kind === 'note' ? (
        <path {...common} d="M4 2.5h5.2L12 5.2V13.5H4zM9.1 2.7V5.4H12" />
      ) : (
        <>
          <path {...common} d="M2.4 4.2h11.2M2.4 8h11.2M2.4 11.8h11.2" />
          <circle {...common} cx="5.2" cy="4.2" r="1.35" />
          <circle {...common} cx="10.6" cy="8" r="1.35" />
          <circle {...common} cx="6.4" cy="11.8" r="1.35" />
        </>
      )}
    </svg>
  )
}

function groupPosts(posts) {
  const groups = []
  for (const post of posts) {
    const label = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(post.updatedAt)
    const last = groups.at(-1)
    if (!last || last.label !== label) groups.push({ label, posts: [post] })
    else last.posts.push(post)
  }
  return groups
}

export function NoteList({
  posts,
  categories,
  activeId,
  captureOpen,
  onSelect,
  onDelete,
}) {
  const [confirmId, setConfirmId] = useState(null)
  const [filter, setFilter] = useState('all')

  const knownFilter = filter === 'all' || filter === 'none' || categories.some((category) => category.id === filter)
    ? filter
    : 'all'
  const names = new Map(categories.map((category) => [category.id, category.name]))
  const hasUncategorized = posts.some((post) => !post.categoryId)
  const matched = knownFilter === 'all'
    ? posts
    : knownFilter === 'none'
      ? posts.filter((post) => !post.categoryId)
      : posts.filter((post) => post.categoryId === knownFilter)
  const groups = groupPosts(matched)
  const pending = matched.find((post) => post.id === confirmId) || null

  function categoryLabel(post) {
    if (knownFilter !== 'all') return ''
    const used = new Set(matched.map((item) => names.get(item.categoryId) || ''))
    if (used.size < 2) return ''
    return names.get(post.categoryId) || ''
  }

  return (
    <div className="note-list">
      {categories.length > 0 ? (
        <div className="nav-actions">
          <MenuSelect
            label="按分类筛选"
            value={knownFilter}
            options={[
              { value: 'all', label: '全部' },
              ...categories.map((category) => ({ value: category.id, label: category.name })),
              ...(hasUncategorized ? [{ value: 'none', label: '未分类' }] : []),
            ]}
            onChange={setFilter}
          />
        </div>
      ) : null}
      <div className="post-list">
        {matched.length === 0 ? <p className="sidebar-empty">{posts.length === 0 ? '还没有文章' : '这个分类还没有文章'}</p> : null}
        {groups.map((group) => (
          <section key={group.label}>
            <p className="month">{group.label}</p>
            {group.posts.map((post) => {
              const active = post.id === activeId && !captureOpen
              return (
                <div className={active ? 'post-row active' : 'post-row'} key={post.id}>
                  <button
                    type="button"
                    className="post-link"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onSelect(post.id)}
                  >
                    <span className="day">{dayLabel(post.updatedAt)}</span>
                    <span className="post-title">
                      {post.title.trim() || '无标题'}
                      {categoryLabel(post) ? <span className="post-cat">{categoryLabel(post)}</span> : null}
                    </span>
                  </button>
                  <button type="button" className="danger-text" onClick={() => setConfirmId(post.id)}>删除</button>
                </div>
              )
            })}
          </section>
        ))}
      </div>
      {pending ? (
        <ConfirmDialog
          title={`删除「${pending.title.trim() || '无标题'}」？`}
          body="这篇文章会从本机删掉。"
          onConfirm={() => {
            onDelete(pending.id)
            setConfirmId(null)
          }}
          onCancel={() => setConfirmId(null)}
        />
      ) : null}
    </div>
  )
}

export function Sidebar({
  posts,
  categories,
  activeId,
  settingsOpen,
  captureOpen,
  onHome,
  onCreatePost,
  onSelect,
  onDelete,
  onOpenSettings,
  onOpenCapture,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button type="button" className="brand" onClick={onHome}>NIke的网站</button>
        <button type="button" className="text-action" onClick={onCreatePost}>空白文章</button>
      </div>
      <NoteList
        posts={posts}
        categories={categories}
        activeId={activeId}
        captureOpen={captureOpen}
        onSelect={onSelect}
        onDelete={onDelete}
      />
      <div className="sidebar-foot">
        <button
          type="button"
          className={captureOpen ? 'settings-link active' : 'settings-link'}
          aria-current={captureOpen ? 'page' : undefined}
          onClick={onOpenCapture}
        >
          <FootIcon kind="note" />
          AI记录
        </button>
        <button
          type="button"
          className={settingsOpen ? 'settings-link active' : 'settings-link'}
          aria-current={settingsOpen ? 'page' : undefined}
          onClick={onOpenSettings}
        >
          <FootIcon kind="settings" />
          设置
        </button>
      </div>
    </aside>
  )
}
