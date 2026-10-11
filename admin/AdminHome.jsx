import { useState } from 'react'
import { categoryName, shortDate, titleOf } from '../www/collections.js'
import { ConfirmDialog } from './ConfirmDialog.jsx'

export function AdminBar({ title, onBack }) {
  return (
    <div className="admin-bar">
      <button type="button" onClick={onBack}>返回后台</button>
      <strong>{title}</strong>
    </div>
  )
}

export function AdminHome({
  posts,
  categories,
  onEdit,
  onView,
  onDelete,
  onCreate,
  onChat,
  onCapture,
  onSettings,
  onFront,
}) {
  const [confirmId, setConfirmId] = useState(null)
  const pending = posts.find((post) => post.id === confirmId) || null
  const rows = [...posts].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>后台</h1>
        </div>
        <div className="admin-actions">
          <button type="button" className="btn" onClick={onCreate}>新建</button>
          <button type="button" className="admin-quiet" onClick={onChat}>对话</button>
          <button type="button" className="admin-quiet" onClick={onCapture}>截图记录</button>
          <button type="button" className="admin-quiet" onClick={onSettings}>设置</button>
          <button type="button" className="admin-quiet" onClick={onFront}>看前台</button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="admin-empty">还没有文章。点「新建」写第一篇，前台会直接显示出来。</p>
      ) : (
        <ul className="admin-list">
          {rows.map((post) => {
            const name = categoryName(post, categories)
            return (
              <li key={post.id}>
                <button type="button" className="admin-open" onClick={() => onEdit(post.id)}>
                  <strong>{titleOf(post)}</strong>
                  <span>{name || '未分类'}</span>
                  <span>{shortDate(post.updatedAt)}</span>
                </button>
                <div className="admin-row-actions">
                  <button type="button" onClick={() => onView(post.id)}>前台</button>
                  <button type="button" onClick={() => onEdit(post.id)}>编辑</button>
                  <button type="button" onClick={() => setConfirmId(post.id)}>删除</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pending ? (
        <ConfirmDialog
          title={`删除「${titleOf(pending)}」？`}
          body="从前台和本机一起删掉。"
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
