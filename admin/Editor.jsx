import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { saveImage } from '../www/db.js'
import { optimizeArticle, optimizePassage } from '../www/cursor.js'
import { citationsOf } from '../www/mentions.js'
import { countMissingImages, countWords, listImageIds } from '../www/text.js'
import { MarkdownBody } from '../www/MarkdownBody.jsx'
import { MenuSelect } from './MenuSelect.jsx'

function KnowledgePeek({ post, posts, anchor, onClose, onPeek }) {
  const cardRef = useRef(null)

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    function onPointer(event) {
      if (cardRef.current?.contains(event.target)) return
      if (event.target.closest?.('.k-mention')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [onClose])

  const width = Math.min(440, window.innerWidth - 32)
  const maxHeight = Math.min(window.innerHeight * 0.62, 480)
  let left = anchor.left
  if (left + width > window.innerWidth - 16) left = window.innerWidth - width - 16
  left = Math.max(16, left)
  let top = anchor.bottom + 8
  if (top + maxHeight > window.innerHeight - 16) top = Math.max(16, anchor.top - maxHeight - 8)

  return createPortal(
    <div
      ref={cardRef}
      className="k-popover"
      role="dialog"
      aria-label={post.title.trim() || '知识点'}
      style={{ top, left, width, maxHeight }}
    >
      <div className="k-popover-head">
        <strong>{post.title.trim() || '无标题'}</strong>
        <button type="button" className="text-action" onClick={onClose}>关闭</button>
      </div>
      <div className="k-popover-body">
        {post.content.trim() ? (
          <MarkdownBody content={post.content} posts={posts} onPeek={onPeek} />
        ) : <p className="quiet">这条还没有正文。</p>}
      </div>
    </div>,
    document.body,
  )
}

function CitePanel({ citations, isKnowledge, onOpenPost }) {
  if (!isKnowledge && citations.length === 0) return null
  return (
    <div className="cite-panel">
      <p>{citations.length === 0 ? '还没有文章引用这条' : `${citations.length} 篇文章引用了这条`}</p>
      {citations.length > 0 ? (
        <ul>
          {citations.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onOpenPost(item.id)}>
                {item.title.trim() || '无标题'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function Editor({
  post,
  posts = [],
  saveState,
  settings,
  categories,
  mode = 'read',
  onMode,
  onBack,
  backLabel = '返回',
  onChange,
  onOpenSettings,
  onCreateCategory,
  onOpenPost,
}) {
  const titleRef = useRef(null)
  const sourceRef = useRef(null)
  const dragDepth = useRef(0)
  const [peek, setPeek] = useState(null)
  const [proposal, setProposal] = useState(null)
  const [optimizing, setOptimizing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState(null)
  const [addingCat, setAddingCat] = useState(false)
  const [catName, setCatName] = useState('')
  const [catError, setCatError] = useState('')
  const [pane, setPane] = useState('source')
  const [hasSelection, setHasSelection] = useState(false)

  useEffect(() => {
    if (mode !== 'edit') return
    if (!post.title.trim()) titleRef.current?.focus()
    else sourceRef.current?.focus()
  }, [mode, post.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const words = countWords(post.content)
  const images = listImageIds(post.content).length
  const editing = mode === 'edit' && !proposal

  function change(partial) {
    setProposal(null)
    onChange(partial)
  }

  function insertAtCursor(text) {
    const node = sourceRef.current
    const value = post.content
    const from = node?.selectionStart ?? value.length
    const to = node?.selectionEnd ?? value.length
    change({ content: `${value.slice(0, from)}${text}${value.slice(to)}` })
    const pos = from + text.length
    requestAnimationFrame(() => {
      const area = sourceRef.current
      if (!area) return
      area.focus()
      area.setSelectionRange(pos, pos)
    })
  }

  async function addImages(files) {
    const parts = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const id = crypto.randomUUID()
      try {
        await saveImage({ id, blob: file, type: file.type || 'image/png', createdAt: Date.now() })
        parts.push(`![截图](img:${id})`)
      } catch (error) {
        const full = error?.name === 'QuotaExceededError'
        setNotice({
          type: 'error',
          text: full ? '浏览器给这个站点的空间满了，图片没能存下。' : '这张图片没能存进本机。',
        })
      }
    }
    if (parts.length === 0) return
    if (mode !== 'edit') onMode?.('edit')
    insertAtCursor(`\n${parts.join('\n\n')}\n`)
  }

  function onDragOver(event) {
    if (![...(event.dataTransfer?.types || [])].includes('Files')) return
    event.preventDefault()
  }

  function onDragEnter(event) {
    if (![...(event.dataTransfer?.types || [])].includes('Files')) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragLeave() {
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }

  function onDrop(event) {
    dragDepth.current = 0
    setDragging(false)
    const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    void addImages(files)
  }

  function onPaste(event) {
    const files = [...(event.clipboardData?.items || [])]
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean)
    if (files.length === 0) return
    event.preventDefault()
    void addImages(files)
  }

  function syncSelection(event) {
    const node = event.target
    setHasSelection(node.selectionEnd > node.selectionStart)
  }

  async function optimizeSelection(passage, from, to) {
    if (optimizing) return
    if (!passage.trim()) {
      setNotice({ type: 'error', text: '先选中要优化的文字。' })
      return
    }
    setOptimizing(true)
    setNotice(null)
    try {
      const entire = from === 0 && to === post.content.length
      if (entire) {
        const result = await optimizeArticle({
          apiKey: settings.apiKey,
          title: post.title,
          content: post.content,
        })
        setProposal({
          title: result.title,
          content: result.content,
          missingImages: countMissingImages(post.content, result.content),
          partial: false,
        })
      } else {
        const next = await optimizePassage({
          apiKey: settings.apiKey,
          passage,
        })
        const content = `${post.content.slice(0, from)}${next}${post.content.slice(to)}`
        setProposal({
          title: post.title,
          content,
          missingImages: countMissingImages(post.content, content),
          partial: true,
        })
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.message || '优化失败了。' })
    } finally {
      setOptimizing(false)
    }
  }

  function optimizeAll() {
    void optimizeSelection(post.content, 0, post.content.length)
  }

  function optimizeSelected() {
    const node = sourceRef.current
    if (!node) return
    void optimizeSelection(post.content.slice(node.selectionStart, node.selectionEnd), node.selectionStart, node.selectionEnd)
  }

  function adopt() {
    if (!proposal) return
    const next = { content: proposal.content }
    if (proposal.title.trim()) next.title = proposal.title.trim()
    setProposal(null)
    onChange(next)
    onMode?.('edit')
    setNotice({ type: 'ok', text: '已换成优化稿。' })
  }

  async function submitCategory(event) {
    event.preventDefault()
    try {
      const created = await onCreateCategory(catName)
      if (!created) {
        setCatError('先写分类名。')
        return
      }
      onChange({ categoryId: created.id })
      setAddingCat(false)
      setCatName('')
      setCatError('')
    } catch (error) {
      setCatError(error.message || '没能加上这个分类。')
    }
  }

  const peekNote = peek?.articleId === post.id ? posts.find((item) => item.id === peek.id) : null

  function openPeek(id, event) {
    const rect = event.currentTarget.getBoundingClientRect()
    setPeek({
      articleId: post.id,
      id,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
    })
  }

  function closePeek() {
    setPeek(null)
  }

  const citations = citationsOf(post.id, posts)
  const categoryName = categories.find((category) => category.id === post.categoryId)?.name || ''
  const saveLabel = saveState === 'saving' ? '正在写入本机…' : saveState === 'error' ? '没能写到本机' : saveState === 'saved' ? '已写入本机' : ''
  const facts = [
    words > 0 ? `${words} 字` : '',
    images > 0 ? `${images} 张图` : '',
  ].filter(Boolean)

  return (
    <section className="paper">
      <div className="editor-bar">
        <button type="button" className="editor-back" onClick={onBack}>{backLabel}</button>
        <div className="mode-switch" role="group" aria-label="稿纸模式">
          <button type="button" aria-pressed={mode === 'read'} onClick={() => onMode?.('read')}>阅读</button>
          <button type="button" aria-pressed={mode === 'edit'} onClick={() => onMode?.('edit')}>编辑</button>
        </div>
      </div>
      <div className="paper-head">
        <div className="copy">
          <label className="sr-only" htmlFor="post-title">标题</label>
          <input
            id="post-title"
            ref={titleRef}
            className="title-input"
            value={post.title}
            placeholder="标题"
            disabled={optimizing}
            onChange={(event) => change({ title: event.target.value })}
          />
          <div className="toolbar">
            {addingCat ? (
              <form className="inline-cat" onSubmit={(event) => { void submitCategory(event) }}>
                <label className="sr-only" htmlFor="new-category">新分类</label>
                <input
                  id="new-category"
                  value={catName}
                  maxLength={16}
                  placeholder="分类名"
                  onChange={(event) => setCatName(event.target.value)}
                />
                <button type="submit" className="btn btn-quiet">添加</button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => {
                    setAddingCat(false)
                    setCatError('')
                  }}
                >
                  取消
                </button>
              </form>
            ) : (
              <>
                <span className="meta">分类</span>
                <MenuSelect
                  label="分类"
                  value={post.categoryId || ''}
                  options={[
                    { value: '', label: '未分类' },
                    ...categories.map((category) => ({ value: category.id, label: category.name })),
                  ]}
                  onChange={(categoryId) => onChange({ categoryId })}
                />
                <button type="button" className="text-action" onClick={() => setAddingCat(true)}>新分类</button>
              </>
            )}
            {editing ? (
              <div className="pane-switch" role="group" aria-label="编辑窗格">
                <button type="button" aria-pressed={pane === 'source'} onClick={() => setPane('source')}>源码</button>
                <button type="button" aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}>预览</button>
              </div>
            ) : null}
            {editing ? (
              <>
                <button type="button" className="text-action" onClick={optimizeAll} disabled={optimizing || !post.content.trim()}>优化全文</button>
                <button type="button" className="text-action" onClick={optimizeSelected} disabled={optimizing || !hasSelection}>优化选中</button>
              </>
            ) : null}
            {saveLabel || facts.length ? (
              <span className="toolbar-meta">
                {saveLabel ? (
                  <span className={saveState === 'error' ? 'status error' : 'status'} role="status">{saveLabel}</span>
                ) : null}
                {facts.length ? <span className="meta">{facts.join(' · ')}</span> : null}
              </span>
            ) : null}
          </div>
          <CitePanel
            citations={citations}
            isKnowledge={categoryName === '知识点'}
            onOpenPost={onOpenPost}
          />
          {catError ? <p className="banner error" role="alert">{catError}</p> : null}
          {notice ? (
            <p className={notice.type === 'error' ? 'banner error' : 'banner ok'} role={notice.type === 'error' ? 'alert' : 'status'}>
              {notice.text}
              {notice.action === 'settings' ? (
                <button type="button" className="text-button" onClick={onOpenSettings}>打开设置</button>
              ) : null}
            </p>
          ) : null}
          {proposal ? (
            <div className="proposal-bar" role="status">
              <p>
                {proposal.partial ? '这一段的效果已经出来，还没写回原文。' : '效果是优化稿，还没写回原文。'}
                {proposal.title.trim() && proposal.title.trim() !== post.title.trim() ? ` 标题会改成「${proposal.title.trim()}」。` : ''}
                {proposal.missingImages > 0 ? ` 有 ${proposal.missingImages} 处图片标记没保住，采用前对一下。` : ''}
              </p>
              <div className="proposal-actions">
                <button type="button" className="btn btn-ink" onClick={adopt}>采用优化稿</button>
                <button type="button" className="btn btn-ink-quiet" onClick={() => setProposal(null)}>留下原文</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div
        className="workspace"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {proposal ? (
          <div className="live-scroll">
            <div className="proposal-review">
              <p className="pane-label">优化稿</p>
              {proposal.content.trim() ? (
                <MarkdownBody content={proposal.content} posts={posts} onPeek={openPeek} />
              ) : <p className="quiet">优化稿是空的。</p>}
            </div>
          </div>
        ) : mode === 'read' ? (
          <div className="live-scroll">
            {post.content.trim() ? (
              <MarkdownBody content={post.content} posts={posts} onPeek={openPeek} />
            ) : <p className="quiet">还没有正文。点右上角「编辑」开始写。</p>}
          </div>
        ) : (
          <div className={pane === 'preview' ? 'edit-split is-preview' : 'edit-split'}>
            <div className="source-pane">
              <label className="sr-only" htmlFor="post-source">正文</label>
              <textarea
                id="post-source"
                ref={sourceRef}
                className="source-input"
                value={post.content}
                placeholder="在这里写 Markdown。代码用 ``` 围起来，图片可以直接粘贴。"
                disabled={optimizing}
                spellCheck="false"
                onChange={(event) => change({ content: event.target.value })}
                onSelect={syncSelection}
                onKeyUp={syncSelection}
                onPaste={onPaste}
              />
            </div>
            <div className="edit-preview">
              <p className="pane-label">预览</p>
              {post.content.trim() ? (
                <MarkdownBody content={post.content} posts={posts} onPeek={openPeek} />
              ) : <p className="quiet">左边写，这里看排好的效果。</p>}
            </div>
          </div>
        )}
        {optimizing ? <div className="live-busy" role="status">正在优化…</div> : null}
        {dragging ? <div className="drop-mask">松开，图片会写进文章</div> : null}
      </div>
      {peekNote ? (
        <KnowledgePeek
          post={peekNote}
          posts={posts}
          anchor={peek}
          onClose={closePeek}
          onPeek={openPeek}
        />
      ) : null}
    </section>
  )
}
