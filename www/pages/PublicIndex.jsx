import { useEffect, useRef } from 'react'
import { categoryName, coverOf, longDate, titleOf } from '../collections.js'

const PAGE_SIZE = 10

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Arrow({ dir }) {
  const left = dir === 'prev'
  return (
    <svg viewBox="0 0 40 16" width="36" height="14" aria-hidden="true">
      <path
        d={left ? 'M12 1.2 L2 8 L12 14.8 M2 8 H38' : 'M28 1.2 L38 8 L28 14.8 M2 8 H38'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  )
}

export function PublicIndex({ posts, categories, hero, heading, page = 1, onPage, onOpen, onCategory }) {
  const feedRef = useRef(null)
  const pages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE))
  const current = hero ? Math.min(Math.max(1, page), pages) : 1
  const visible = hero ? posts.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) : posts
  const visibleKey = visible.map((post) => post.id).join(',')

  useEffect(() => {
    if (!hero || page === current) return
    onPage(current)
  }, [hero, page, current, onPage])

  useEffect(() => {
    const pane = feedRef.current?.closest('.pub-main')
    pane?.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [hero, current])

  useEffect(() => {
    const feed = feedRef.current
    const pane = feed?.closest('.pub-main')
    if (!feed || !pane) return undefined
    const nodes = [...feed.querySelectorAll('.pub-reveal')]
    if (reducedMotion()) {
      nodes.forEach((node) => node.classList.add('is-shown'))
      return undefined
    }

    const shiftOf = (node) => {
      const value = getComputedStyle(node).transform
      if (!value || value === 'none') return 0
      const parts = value.match(/matrix\(([^)]+)\)/)
      return parts ? Number(parts[1].split(',')[5]) || 0 : 0
    }

    let frame = 0
    const reveal = () => {
      frame = 0
      const box = pane.getBoundingClientRect()
      nodes.forEach((node) => {
        if (node.classList.contains('is-shown')) return
        const rect = node.getBoundingClientRect()
        const top = rect.top - shiftOf(node)
        if (top < box.bottom - 36) node.classList.add('is-shown')
      })
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(reveal)
    }
    reveal()
    pane.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      pane.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [visibleKey])

  function turn(next) {
    const pageNumber = Math.min(Math.max(1, next), pages)
    if (pageNumber === current) return
    onPage(pageNumber)
  }

  return (
    <>
      {hero ? (
        <h1 className="pub-hello"><span>Hello.</span></h1>
      ) : (
        <h1 className="pub-hello"><span>{heading}</span></h1>
      )}
      {visible.length === 0 ? (
        <p className="pub-empty">No posts yet.</p>
      ) : (
        <ul className="pub-feed" ref={feedRef}>
          {visible.map((post) => {
            const cover = coverOf(post.content)
            const name = categoryName(post, categories)
            const label = titleOf(post)
            return (
              <li key={post.id}>
                <article className="pub-post pub-reveal">
                  {cover ? (
                    <button type="button" className="pub-cover" onClick={() => onOpen(post.id)}>
                      <img src={cover} alt="" />
                    </button>
                  ) : null}
                  <time dateTime={new Date(post.updatedAt || Date.now()).toISOString()}>{longDate(post.updatedAt)}</time>
                  <h2>
                    <button type="button" onClick={() => onOpen(post.id)}>
                      <span className="pub-clip">
                        <span className="pub-swap" data-hover={label}>{label}</span>
                      </span>
                    </button>
                  </h2>
                  {name ? (
                    <p className="pub-cats">
                      <button type="button" onClick={() => onCategory(name)}>{name}</button>
                    </p>
                  ) : null}
                </article>
              </li>
            )
          })}
          {hero && pages > 1 ? (
            <li className="pub-pager-item">
              <nav className="pub-pager pub-reveal" aria-label="分页">
                <button
                  type="button"
                  className="pub-pager-prev"
                  aria-label="上一页"
                  disabled={current <= 1}
                  onClick={() => turn(current - 1)}
                >
                  <Arrow dir="prev" />
                </button>
                <div className="pub-pager-nums">
                  <span>{current}</span>
                  <span>{pages}</span>
                </div>
                <p className="sr-only">第 {current} 页，共 {pages} 页</p>
                <button
                  type="button"
                  className="pub-pager-next"
                  aria-label="下一页"
                  disabled={current >= pages}
                  onClick={() => turn(current + 1)}
                >
                  <Arrow dir="next" />
                </button>
              </nav>
            </li>
          ) : null}
        </ul>
      )}
    </>
  )
}
