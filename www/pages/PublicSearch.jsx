import { useEffect } from 'react'
import { categoryName, longDate, titleOf } from '../collections.js'

function tokensOf(query) {
  return String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function plainText(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, (block) => ` ${block.replace(/```/g, ' ')} `)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\^[^\]]+\]:?/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^(-{3,}|\*{3,}|_{3,})\s*$/gm, ' ')
    .replace(/[*_>#~`|[\]\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function searchPosts(posts, query) {
  const tokens = tokensOf(query)
  if (tokens.length === 0) return []
  return posts
    .map((post) => {
      const title = titleOf(post)
      const body = plainText(post.content)
      const hay = `${title}\n${body}`.toLowerCase()
      if (!tokens.every((token) => hay.includes(token))) return null
      const titleHits = tokens.filter((token) => title.toLowerCase().includes(token)).length
      return { post, title, body, titleHits }
    })
    .filter(Boolean)
    .sort((a, b) => b.titleHits - a.titleHits || (b.post.updatedAt || 0) - (a.post.updatedAt || 0))
}

function Highlight({ text, tokens }) {
  const list = tokens.filter(Boolean)
  if (list.length === 0 || !text) return text
  const pattern = new RegExp(`(${list.map(escapeRegExp).join('|')})`, 'gi')
  const parts = String(text).split(pattern)
  return parts.map((part, index) => (
    list.some((token) => token.toLowerCase() === part.toLowerCase())
      ? <mark key={index}>{part}</mark>
      : part
  ))
}

function excerpt(body, tokens) {
  const lower = body.toLowerCase()
  let at = -1
  let size = 0
  for (const token of tokens) {
    const found = lower.indexOf(token)
    if (found >= 0 && (at < 0 || found < at)) {
      at = found
      size = token.length
    }
  }
  if (at < 0) {
    return body.length > 72 ? `${body.slice(0, 72)}…` : body
  }
  const start = Math.max(0, at - 18)
  const end = Math.min(body.length, at + size + 42)
  const slice = body.slice(start, end).trim()
  return `${start > 0 ? '…' : ''}${slice}${end < body.length ? '…' : ''}`
}

export function PublicSearch({ posts, categories, query, onOpen, onCategory }) {
  const tokens = tokensOf(query)
  const results = searchPosts(posts, query)

  useEffect(() => {
    document.querySelector('.pub-main')?.scrollTo({ top: 0 })
  }, [query])

  return (
    <div className="pub-search">
      <h1 className="pub-hello"><span>搜索</span></h1>
      {tokens.length === 0 ? (
        <p className="pub-empty">请输入搜索条件。</p>
      ) : results.length === 0 ? (
        <p className="pub-empty">没有找到和「{query.trim()}」有关的文章。</p>
      ) : (
        <>
          <p className="pub-search-count">找到 {results.length} 篇</p>
          <ul className="pub-hits">
            {results.map(({ post, title, body }) => {
              const name = categoryName(post, categories)
              const piece = excerpt(body, tokens)
              return (
                <li key={post.id}>
                  <article className="pub-hit">
                    <time dateTime={new Date(post.updatedAt || Date.now()).toISOString()}>{longDate(post.updatedAt)}</time>
                    <h2>
                      <button type="button" onClick={() => onOpen(post.id)}>
                        <Highlight text={title} tokens={tokens} />
                      </button>
                    </h2>
                    {piece ? (
                      <p><Highlight text={piece} tokens={tokens} /></p>
                    ) : null}
                    {name ? (
                      <p className="pub-cats">
                        <button type="button" onClick={() => onCategory(name)}>{name}</button>
                      </p>
                    ) : null}
                  </article>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
