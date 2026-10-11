import { articleDate, categoryName, coverOf, titleOf } from '../collections.js'
import { MarkdownBody } from '../MarkdownBody.jsx'

function withoutFirstImage(content) {
  return String(content || '').replace(/!\[[^\]]*\]\([^)]+\)/, '')
}

function withoutLeadingTitle(content, title) {
  const heading = String(title || '').trim()
  if (!heading) return content
  const pattern = new RegExp(`^\\s*#{1,6}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'u')
  return content.replace(pattern, '')
}

export function PublicPost({ post, posts, categories, onCategory }) {
  const name = categoryName(post, categories)
  const cover = coverOf(post.content)
  const body = withoutLeadingTitle(cover ? withoutFirstImage(post.content) : post.content, post.title).trim()

  return (
    <article className="pub-article">
      <time dateTime={new Date(post.updatedAt || Date.now()).toISOString()}>{articleDate(post.updatedAt)}</time>
      <h1 className="pub-rise"><span>{titleOf(post)}</span></h1>
      {name ? (
        <p className="pub-cats">
          <button type="button" onClick={() => onCategory(name)}>{name}</button>
        </p>
      ) : null}
      {cover ? <img className="pub-heroimg" src={cover} alt="" /> : null}
      {body ? (
        <div className="pub-body">
          <MarkdownBody content={body} posts={posts} />
        </div>
      ) : (
        <p className="pub-empty">This post is empty.</p>
      )}
    </article>
  )
}
