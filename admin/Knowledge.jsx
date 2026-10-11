import { useMemo, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog.jsx'
import { PostFeed } from './PostFeed.jsx'
import { SiteNav } from './SiteNav.jsx'
import { postsIn, titleOf } from '../www/collections.js'

export function Knowledge({
  posts,
  categories,
  onNavigate,
  onOpenPost,
  onDelete,
  onCreateKnowledge,
  onOpenCapture,
  onOpenSettings,
}) {
  const [filter, setFilter] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const notes = postsIn(posts, categories, '知识点')

  const shown = useMemo(() => {
    const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return notes
    return notes.filter((post) => {
      const hay = `${post.title}\n${post.content}`.toLowerCase()
      return tokens.every((token) => hay.includes(token))
    })
  }, [notes, filter])

  const pending = posts.find((post) => post.id === confirmId) || null

  return (
    <div className="ray">
      <SiteNav
        current="knowledge"
        onNavigate={onNavigate}
        onOpenSettings={onOpenSettings}
        posts={posts}
        onOpenPost={onOpenPost}
      />

      <div className="ray-column">
        <h1 className="ray-hello">记录。</h1>
        <div className="ray-tools">
          <button type="button" className="ray-textbtn" onClick={onCreateKnowledge}>记一条</button>
          <button type="button" className="ray-textbtn" onClick={onOpenCapture}>截图记录</button>
          {notes.length > 0 ? (
            <input
              className="ray-filter"
              type="search"
              value={filter}
              placeholder="搜索后回车"
              onChange={(event) => setFilter(event.target.value)}
            />
          ) : null}
        </div>

        {notes.length === 0 ? (
          <p className="ray-empty">还没有知识点。点「记一条」写下第一条，或回对话里说「记一条知识点：…」。</p>
        ) : shown.length === 0 ? (
          <p className="ray-empty">没有匹配「{filter.trim()}」的知识点。</p>
        ) : (
          <PostFeed
            posts={shown}
            categoryName="知识点"
            onOpen={onOpenPost}
            onDelete={setConfirmId}
          />
        )}
      </div>

      {pending ? (
        <ConfirmDialog
          title={`删除「${titleOf(pending)}」？`}
          body="这条知识点会从本机删掉。"
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
