import { useState } from 'react'
import { cleanCategoryName } from '../www/text.js'

export function NewSheet({ onBack, onCreatePost, onAddCategory }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function addCategory(event) {
    event.preventDefault()
    const cleaned = cleanCategoryName(name)
    if (!cleaned) {
      setError('先写分类名。')
      return
    }
    try {
      await onAddCategory(cleaned)
      setName('')
      setError('')
    } catch (err) {
      setError(err.message || '没能加上这个分类。')
    }
  }

  return (
    <section className="paper settings-sheet">
      <button type="button" className="btn btn-quiet" onClick={onBack}>返回首页</button>
      <h1>写什么</h1>
      <div className="new-actions">
        <button type="button" className="btn btn-yellow" onClick={onCreatePost}>空白文章</button>
      </div>
      <p className="lead">分类只是给文章归组。</p>
      <form className="cat-add" onSubmit={(event) => { void addCategory(event) }}>
        <input
          value={name}
          aria-label="新分类"
          placeholder="新分类"
          maxLength={16}
          onChange={(event) => {
            setName(event.target.value)
            setError('')
          }}
        />
        <button type="submit">添加分类</button>
      </form>
      {error ? <p className="banner error" role="alert">{error}</p> : null}
    </section>
  )
}
