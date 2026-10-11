import { useEffect, useMemo, useRef, useState } from 'react'
import { titleOf } from '../collections.js'

let preloaderPlayed = false

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Preloader({ onDone, onGone }) {
  const [pct, setPct] = useState(0)
  const [leave, setLeave] = useState(false)
  const done = useRef(onDone)
  const gone = useRef(onGone)
  done.current = onDone
  gone.current = onGone

  useEffect(() => {
    if (reducedMotion()) {
      preloaderPlayed = true
      done.current()
      return undefined
    }
    const start = performance.now()
    const duration = 1100
    let frame = 0
    let leaveTimer = 0
    let doneTimer = 0
    const tick = (now) => {
      const next = Math.min(100, Math.round(((now - start) / duration) * 100))
      setPct(next)
      if (next < 100) {
        frame = requestAnimationFrame(tick)
        return
      }
      leaveTimer = window.setTimeout(() => {
        setLeave(true)
        done.current()
      }, 160)
      doneTimer = window.setTimeout(() => {
        preloaderPlayed = true
        gone.current()
      }, 1200)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(leaveTimer)
      window.clearTimeout(doneTimer)
    }
  }, [])

  return (
    <div className={leave ? 'pub-pre is-out' : 'pub-pre'} aria-hidden="true">
      <p className="pub-pre-word">Please Wait</p>
      <span className="pub-pre-loaded">Loaded</span>
      <span className="pub-pre-pct">{pct}</span>
    </div>
  )
}

function Cursor() {
  const dot = useRef(null)
  const ring = useRef(null)

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches
    if (!fine || reducedMotion()) return undefined
    const dotEl = dot.current
    const ringEl = ring.current
    if (!dotEl || !ringEl) return undefined
    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    let dx = x
    let dy = y
    let rx = x
    let ry = y
    let frame = 0
    const loop = () => {
      dx += (x - dx) * 0.65
      dy += (y - dy) * 0.65
      rx += (x - rx) * 0.16
      ry += (y - ry) * 0.16
      dotEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
      ringEl.style.transform = `translate3d(${rx}px, ${ry}px, 0)`
      frame = requestAnimationFrame(loop)
    }
    const onMove = (event) => {
      x = event.clientX
      y = event.clientY
      dotEl.classList.add('is-on')
      ringEl.classList.add('is-on')
    }
    const onOver = (event) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('.pub')) return
      const hot = Boolean(target.closest('a, button, input, textarea, select, label'))
      dotEl.classList.toggle('is-hot', hot)
      ringEl.classList.toggle('is-hot', hot)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseover', onOver)
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseover', onOver)
    }
  }, [])

  return (
    <>
      <div ref={ring} className="pub-cursor pub-cursor-ring" aria-hidden="true" />
      <div ref={dot} className="pub-cursor pub-cursor-dot" aria-hidden="true" />
    </>
  )
}

function HeaderSearch({ value: current = '', onSearch }) {
  const input = useRef(null)
  const [value, setValue] = useState(current)
  const [hot, setHot] = useState(false)
  const [focus, setFocus] = useState(false)
  const open = hot || focus
  const ready = value.trim().length > 0

  useEffect(() => {
    setValue(current)
  }, [current])

  function submit(event) {
    event.preventDefault()
    onSearch(value)
  }

  return (
    <form
      className={open ? 'ray-search is-open' : 'ray-search'}
      onSubmit={submit}
      onMouseEnter={() => {
        setHot(true)
        input.current?.focus()
      }}
      onMouseLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        setHot(false)
        if (!input.current?.value.trim()) input.current?.blur()
      }}
      onFocus={() => setFocus(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false)
      }}
    >
      <button type="button" className="ray-search-glass" aria-label="搜索" onClick={() => input.current?.focus()}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.15" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12.3 12.3 L16.8 16.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <label className="sr-only" htmlFor="ray-search">搜索条件</label>
      <input
        id="ray-search"
        ref={input}
        value={value}
        placeholder="搜索标题或正文"
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        type="submit"
        className={ready ? 'ray-search-go is-on' : 'ray-search-go'}
        aria-label="开始搜索"
        tabIndex={ready ? 0 : -1}
      >
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
          <path fill="currentColor" d="M1 10h12V4l18 12-18 12v-6H1z" />
        </svg>
      </button>
    </form>
  )
}

export function SiteFrame({
  posts,
  categories,
  current,
  pageKey,
  searchQuery = '',
  onHome,
  onArchive,
  onOpenPost,
  onSearch,
  children,
}) {
  const [menu, setMenu] = useState(false)
  const [side, setSide] = useState(false)
  const [query, setQuery] = useState('')
  const skipIntro = preloaderPlayed || reducedMotion()
  const [ready, setReady] = useState(skipIntro)
  const [showPre, setShowPre] = useState(!skipIntro)
  const [booted, setBooted] = useState(skipIntro)
  const [enter, setEnter] = useState(false)
  const firstPage = useRef(true)

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

  useEffect(() => {
    if (!ready) return undefined
    const timer = window.setTimeout(() => setBooted(true), 1900)
    return () => window.clearTimeout(timer)
  }, [ready])

  useEffect(() => {
    if (!ready) return undefined
    if (firstPage.current) {
      firstPage.current = false
      return undefined
    }
    setEnter(false)
    const frame = requestAnimationFrame(() => setEnter(true))
    const timer = window.setTimeout(() => setEnter(false), 700)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [pageKey, ready])

  const links = [
    { id: 'home', label: 'Home', run: onHome },
    { id: 'archive', label: 'All Posts', run: () => onArchive('') },
    ...categories.map((category) => ({
      id: category.name,
      label: category.name,
      run: () => onArchive(category.name),
    })),
  ]

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

  function close() {
    setMenu(false)
    setSide(false)
  }

  const shell = [
    'pub',
    ready ? 'is-ready' : '',
    booted ? 'is-booted' : '',
    'has-cursor',
  ].filter(Boolean).join(' ')

  return (
    <div className={shell}>
      {showPre ? (
        <Preloader onDone={() => setReady(true)} onGone={() => setShowPre(false)} />
      ) : null}
      <Cursor />
      <header className="ray-header">
        <div className="ray-bar">
          <button type="button" className="ray-logo" onClick={() => { close(); onHome() }}>
            NIke
          </button>
          <div className="ray-header-actions">
            <HeaderSearch value={searchQuery} onSearch={onSearch} />
            <button
              type="button"
              className={side ? 'ray-iconbtn is-open' : 'ray-iconbtn'}
              aria-label={side ? 'Close recent posts' : 'Recent posts'}
              aria-expanded={side}
              onClick={() => {
                setSide((open) => !open)
                setMenu(false)
              }}
            >
              <svg className="ray-side-glyph" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                <path d="M3 5 H17 M3 10 H17 M3 15 H17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={menu ? 'ray-burger is-open' : 'ray-burger'}
              aria-label={menu ? 'Close menu' : 'Open menu'}
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

        <div className={menu ? 'ray-menu is-open' : 'ray-menu'} aria-hidden={menu ? undefined : true}>
          <nav aria-label="Site">
            {links.map((link, index) => (
              <button
                key={link.id}
                type="button"
                className={current === link.id ? 'is-active' : undefined}
                style={{ '--i': index }}
                tabIndex={menu ? 0 : -1}
                onClick={() => { close(); link.run() }}
              >
                <span className="pub-clip">
                  <span className="pub-line">
                    <span className="pub-swap" data-hover={link.label}>{link.label}</span>
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </div>

        <button
          type="button"
          className={side ? 'ray-shade is-open' : 'ray-shade'}
          aria-label="Close sidebar"
          aria-hidden={side ? undefined : true}
          tabIndex={side ? 0 : -1}
          onClick={() => setSide(false)}
        />
        <aside className={side ? 'ray-side is-open' : 'ray-side'} aria-label="Recent posts" aria-hidden={side ? undefined : true}>
              <form onSubmit={(event) => event.preventDefault()}>
                <label className="sr-only" htmlFor="pub-search">Search</label>
                <input
                  id="pub-search"
                  type="search"
                  value={query}
                  placeholder="Search and hit enter"
                  tabIndex={side ? 0 : -1}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </form>
              <h2>Recent Posts</h2>
              {recent.length === 0 ? (
                <p className="ray-side-empty">No posts match.</p>
              ) : (
                <ul>
                  {recent.map((post) => (
                    <li key={post.id}>
                      <button type="button" tabIndex={side ? 0 : -1} onClick={() => { close(); onOpenPost(post.id) }}>
                        {titleOf(post)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
      </header>
      <div className="pub-main">
        <div className={enter ? 'pub-column is-enter' : 'pub-column'} key={pageKey}>{children}</div>
      </div>
    </div>
  )
}
