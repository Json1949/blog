import { useEffect, useState } from 'react'
import { loadCategories, loadPosts } from './db.js'
import { PublicIndex } from './pages/PublicIndex.jsx'
import { PublicPost } from './pages/PublicPost.jsx'
import { PublicSearch } from './pages/PublicSearch.jsx'
import { SiteFrame } from './pages/SiteFrame.jsx'

function readLocation() {
  const hash = window.location.hash
  const front = { view: 'public', id: null, filter: '', page: 1, query: '' }
  if (!hash || hash === '#' || hash === '#/' || hash === '#/page' || hash === '#/page/') return front
  if (hash === '#/search' || hash.startsWith('#/search?')) {
    const params = new URLSearchParams(hash.slice('#/search'.length).replace(/^\?/, ''))
    return { view: 'search', id: null, filter: '', page: 1, query: params.get('q') || '' }
  }
  const homePage = hash.match(/^#\/page\/(\d+)\/?$/)
  if (homePage) return { ...front, page: Math.max(1, Number(homePage[1])) }
  if (hash === '#/archive' || hash === '#/blog') return { view: 'archive', id: null, filter: '' }
  if (hash === '#/k' || hash === '#/notes') return { view: 'archive', id: null, filter: '知识点' }
  const category = hash.match(/^#\/c\/([^/?#]+)/)
  if (category) return { view: 'archive', id: null, filter: decodeURIComponent(category[1]) }
  const post = hash.match(/^#\/p\/([^/?#]+)/)
  if (post) return { view: 'post', id: decodeURIComponent(post[1]), filter: '' }
  return front
}

function replaceHash(next) {
  if (window.location.hash !== next) history.replaceState(null, '', next)
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState('')
  const [posts, setPosts] = useState([])
  const [categories, setCategories] = useState([])
  const [activeId, setActiveId] = useState(() => readLocation().id)
  const [view, setView] = useState(() => readLocation().view)
  const [categoryFilter, setCategoryFilter] = useState(() => readLocation().filter)
  const [page, setPage] = useState(() => readLocation().page || 1)
  const [query, setQuery] = useState(() => readLocation().query || '')

  useEffect(() => {
    const start = readLocation()
    let cancelled = false
    loadPosts().then(async (rows) => {
      const storedCategories = await loadCategories()
      if (cancelled) return
      setPosts(rows)
      setCategories(storedCategories)
      if (start.id && !rows.some((post) => post.id === start.id)) {
        setActiveId(null)
        setView('public')
        setCategoryFilter('')
      }
      setReady(true)
    }).catch(() => {
      if (!cancelled) setBootError('文章没能读出来。请运行 start.bat。')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function syncFromHash() {
      const next = readLocation()
      setView(next.view)
      setActiveId(next.id)
      setCategoryFilter(next.filter || '')
      if (next.view === 'public') setPage(next.page || 1)
      setQuery(next.query || '')
    }
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (view === 'public') {
      replaceHash(page > 1 ? `#/page/${page}` : '#/')
      return
    }
    if (view === 'archive') {
      replaceHash(categoryFilter ? `#/c/${encodeURIComponent(categoryFilter)}` : '#/archive')
      return
    }
    if (view === 'search') {
      const text = query.trim()
      replaceHash(text ? `#/search?q=${encodeURIComponent(text)}` : '#/search')
      return
    }
    const exists = Boolean(activeId && posts.some((post) => post.id === activeId))
    if (!exists) {
      setView('public')
      setActiveId(null)
      return
    }
    replaceHash(`#/p/${activeId}`)
  }, [ready, view, activeId, posts, categoryFilter, page, query])

  useEffect(() => {
    const post = posts.find((item) => item.id === activeId)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f7f6f3')
    if (view === 'search') document.title = query.trim() ? `搜索「${query.trim()}」· NIke的网站` : '搜索 · NIke的网站'
    else if (view === 'archive') document.title = categoryFilter ? `${categoryFilter} · NIke的网站` : 'All Posts · NIke的网站'
    else if (view === 'post' && post?.title.trim()) document.title = `${post.title.trim()} · NIke的网站`
    else document.title = 'NIke的网站'
  }, [posts, activeId, view, categoryFilter, query])

  function openPublic() {
    setCategoryFilter('')
    setActiveId(null)
    setPage(1)
    setView('public')
  }

  function openArchive(name = '') {
    setCategoryFilter(name)
    setActiveId(null)
    setView('archive')
  }

  function showPost(id) {
    setActiveId(id)
    setView('post')
  }

  function openSearch(text) {
    const next = String(text || '').replace(/\s+/g, ' ').trim()
    if (!next) return
    setQuery(next)
    setActiveId(null)
    setCategoryFilter('')
    setView('search')
  }

  if (bootError) {
    return <div className="boot"><p>{bootError}</p></div>
  }
  if (!ready) {
    return <div className="boot"><p>正在打开本地文章…</p></div>
  }

  const active = posts.find((post) => post.id === activeId) || null
  const published = [...posts].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const listed = categoryFilter
    ? published.filter((post) => categories.find((item) => item.id === post.categoryId)?.name === categoryFilter)
    : published

  return (
    <div className="app home-shell is-day">
      <main className="stage">
        <SiteFrame
          posts={posts}
          categories={categories}
          current={view === 'public' ? 'home' : view === 'search' ? 'search' : (categoryFilter || 'archive')}
          pageKey={`${view}:${categoryFilter}:${page}:${query}:${active?.id || ''}`}
          onHome={openPublic}
          onArchive={openArchive}
          searchQuery={view === 'search' ? query : ''}
          onOpenPost={showPost}
          onSearch={openSearch}
        >
          {view === 'search' ? (
            <PublicSearch
              posts={published}
              categories={categories}
              query={query}
              onOpen={showPost}
              onCategory={openArchive}
            />
          ) : view === 'post' && active ? (
            <PublicPost
              post={active}
              posts={posts}
              categories={categories}
              onCategory={openArchive}
            />
          ) : view === 'post' ? (
            <p className="pub-empty">This post is gone.</p>
          ) : (
            <PublicIndex
              posts={view === 'public' ? published : listed}
              categories={categories}
              hero={view === 'public'}
              heading={categoryFilter || 'All Posts'}
              page={page}
              onPage={setPage}
              onOpen={showPost}
              onCategory={openArchive}
            />
          )}
        </SiteFrame>
      </main>
    </div>
  )
}
