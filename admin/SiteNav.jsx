import { useEffect, useMemo, useState } from 'react'
import { titleOf } from '../www/collections.js'

const LINKS = [
  { id: 'home', label: '对话' },
  { id: 'blog', label: '博客' },
  { id: 'knowledge', label: '知识点' },
]

export function SiteNav({ current, onNavigate, onOpenSettings, posts = [], onOpenPost }) {
  const [menu, setMenu] = useState(false)
  const [side, setSide] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') {
        setMenu(false)
        setSide(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const recent = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    const rows = [...posts].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    const filtered = tokens.length === 0
      ? rows
      : rows.filter((post) => {
        const hay = `${post.title}\n${post.content}`.toLowerCase()
        return tokens.every((token) => hay.includes(token))
      })
    return filtered.slice(0, 8)
  }, [posts, query])

  function go(id) {
    setMenu(false)
    setSide(false)
    if (id === 'settings') onOpenSettings()
    else onNavigate(id)
  }

  function openRecent(id) {
    setSide(false)
    setMenu(false)
    onOpenPost?.(id)
  }

  return (
    <header className="ray-header">
      <div className="ray-bar">
        <button type="button" className="ray-logo" onClick={() => go('home')}>
          NIke的网站
        </button>
        <div className="ray-header-actions">
        <button
          type="button"
          className={side ? 'ray-iconbtn is-open' : 'ray-iconbtn'}
          aria-label={side ? '关闭最近文章' : '最近文章'}
          aria-expanded={side}
          onClick={() => {
            setSide((open) => !open)
            setMenu(false)
          }}
        >
          <span className="ray-side-glyph" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={menu ? 'ray-burger is-open' : 'ray-burger'}
          aria-label={menu ? '关闭菜单' : '打开菜单'}
          aria-expanded={menu}
          onClick={() => {
            setMenu((open) => !open)
            setSide(false)
          }}
        >
          <span />
          <span />
          <span />
        </button>
        </div>
      </div>

      {menu ? (
        <div className="ray-menu">
          <nav aria-label="内容">
            {LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                className={current === link.id ? 'is-active' : undefined}
                aria-current={current === link.id ? 'page' : undefined}
                onClick={() => go(link.id)}
              >
                {link.label}
              </button>
            ))}
            <button type="button" onClick={() => go('settings')}>设置</button>
          </nav>
        </div>
      ) : null}

      {side ? (
        <>
          <button type="button" className="ray-shade" aria-label="关闭侧栏" onClick={() => setSide(false)} />
          <aside className="ray-side" aria-label="最近文章">
            <form onSubmit={(event) => event.preventDefault()}>
              <label className="sr-only" htmlFor="ray-search">搜索</label>
              <input
                id="ray-search"
                type="search"
                value={query}
                placeholder="搜索后回车"
                onChange={(event) => setQuery(event.target.value)}
              />
            </form>
            <h2>最近文章</h2>
            {recent.length === 0 ? (
              <p className="ray-side-empty">没有匹配的文章。</p>
            ) : (
              <ul>
                {recent.map((post) => (
                  <li key={post.id}>
                    <button type="button" onClick={() => openRecent(post.id)}>
                      {titleOf(post)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </>
      ) : null}
    </header>
  )
}
