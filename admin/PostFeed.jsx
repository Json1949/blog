import { coverOf, longDate, snippetOf, titleOf } from '../www/collections.js'

export function PostFeed({ posts, categoryName, onOpen, onDelete }) {
  return (
    <ul className="ray-feed">
      {posts.map((post) => {
        const cover = coverOf(post.content)
        const snippet = snippetOf(post.content, 140)
        return (
          <li key={post.id}>
            <article className="ray-post">
              {cover ? (
                <button type="button" className="ray-cover" onClick={() => onOpen(post.id)}>
                  <img src={cover} alt="" />
                </button>
              ) : null}
              <time dateTime={new Date(post.updatedAt || Date.now()).toISOString()}>{longDate(post.updatedAt)}</time>
              <h2>
                <button type="button" onClick={() => onOpen(post.id)}>{titleOf(post)}</button>
              </h2>
              {snippet ? <p className="ray-excerpt">{snippet}</p> : null}
              <p className="ray-cats">
                <button type="button" onClick={() => onOpen(post.id)}>{categoryName}</button>
              </p>
              <button type="button" className="ray-del" onClick={() => onDelete(post.id)}>
                删除
              </button>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
