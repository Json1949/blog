import { useMemo, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog.jsx'
import { PostFeed } from './PostFeed.jsx'
import { SiteNav } from './SiteNav.jsx'
import { postsIn, titleOf } from '../www/collections.js'

export function Blog({
  posts,
  categories,
  onNavigate,
  onOpenPost,
  onDelete,
  onCreateBlank,
  onOpenSettings,
}) {
  const [filter, setFilter] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const blogs = postsIn(posts, categories, '博客')

  const shown = useMemo(() => {
    const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return blogs
    return blogs.filter((post) => {
      const hay = `${post.title}\n${post.content}`.toLowerCase()
      return tokens.every((token) => hay.includes(token))
    })
  }, [blogs, filter])

  const pending = posts.find((post) => post.id === confirmId) || null

  return (
    <div className="ray">
      <SiteNav
        current="blog"
        onNavigate={onNavigate}
        onOpenSettings={onOpenSettings}
        posts={posts}
        onOpenPost={onOpenPost}
      />

      <div className="ray-column">
        <h1 className="ray-hello">你好。</h1>
        <div className="ray-tools">
          <button type="button" className="ray-textbtn" onClick={onCreateBlank}>空白文章</button>
          {blogs.length > 0 ? (
            <input
              className="ray-filter"
              type="search"
              value={filter}
              placeholder="搜索后回车"
              onChange={(event) => setFilter(event.target.value)}
            />
          ) : null}
        </div>

        {blogs.length === 0 ? (
          <p className="ray-empty">还没有博客。回「对话」说「写一篇关于…的博客」，我来起草。</p>
        ) : shown.length === 0 ? (
          <p className="ray-empty">没有匹配「{filter.trim()}」的博客。</p>
        ) : (
          <PostFeed
            posts={shown}
            categoryName="博客"
            onOpen={onOpenPost}
            onDelete={setConfirmId}
          />
        )}
      </div>

      {pending ? (
        <ConfirmDialog
          title={`删除「${titleOf(pending)}」？`}
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
