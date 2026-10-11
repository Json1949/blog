const MENTION = /\[@([^\]]+)]\(k:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi
const AT = /(?:^|[\s，。、；：,.;:（(【「])@([^\s@[\]]{0,32})$/

export function mentionMarkdown(title, id) {
  const safe = String(title || '').replace(/[[\]]/g, '').trim()
  return `[@${safe}](k:${id})`
}

export function listMentions(markdown) {
  const seen = new Set()
  const out = []
  for (const match of String(markdown || '').matchAll(MENTION)) {
    const id = match[2].toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, label: match[1] })
  }
  return out
}

export function mentionQuery(value, cursor) {
  const before = String(value || '').slice(0, cursor)
  const match = before.match(AT)
  if (!match) return null
  return {
    query: match[1],
    start: before.length - match[1].length - 1,
  }
}

export function knowledgePosts(posts, categories) {
  const ids = new Set(
    categories.filter((category) => category.name === '知识点').map((category) => category.id),
  )
  return posts
    .filter((post) => ids.has(post.categoryId) && post.title.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function filterKnowledge(posts, query) {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return posts
  const titles = posts.filter((post) => post.title.toLocaleLowerCase().includes(q))
  if (titles.length > 0) return titles
  return posts.filter((post) => post.content.toLocaleLowerCase().includes(q))
}

export function citationsOf(postId, posts) {
  const id = String(postId || '').toLowerCase()
  return posts
    .filter((post) => post.id !== id && listMentions(post.content).some((item) => item.id === id))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
