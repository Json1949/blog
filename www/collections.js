const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' })
const longFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const articleFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export function titleOf(post) {
  return post.title.trim() || '无标题'
}

export function shortDate(timestamp) {
  return dateFormatter.format(timestamp)
}

export function longDate(timestamp) {
  return longFormatter.format(timestamp)
}

export function articleDate(timestamp) {
  return articleFormatter.format(timestamp)
}

export function categoryName(post, categories) {
  return categories.find((item) => item.id === post.categoryId)?.name || ''
}

export function coverOf(content) {
  const match = String(content || '').match(/!\[[^\]]*\]\(([^)\s]+)\)/)
  return match ? match[1] : ''
}

export function postsIn(posts, categories, name) {
  const category = categories.find((item) => item.name === name)
  if (!category) return []
  return posts
    .filter((post) => post.categoryId === category.id)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function snippetOf(content, limit = 96) {
  const text = String(content || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>#~`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}
