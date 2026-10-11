import { useEffect, useRef, useState } from 'react'
import { SiteNav } from './SiteNav.jsx'
import { shortDate } from '../www/collections.js'

const CHIPS = [
  { label: '写一篇博客', fill: '写一篇博客，讲讲 ' },
  { label: '记一条知识点', fill: '记一条知识点：' },
  { label: '查找内容', fill: '找找我写过的 ' },
  { label: '打开博客', fill: '打开博客' },
]

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
      <path d="M5 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Steps({ steps, live = false }) {
  if (!steps || steps.length === 0) return null
  return (
    <ol className="work-steps">
      {steps.map((step, index) => (
        <li key={`${step}-${index}`} className={live && index === steps.length - 1 ? 'is-now' : undefined}>{step}</li>
      ))}
    </ol>
  )
}

function Message({ message, onOpenPost, onOpenHit }) {
  if (message.role === 'user') {
    return (
      <li className="msg msg-user">
        <div className="bubble bubble-user">{message.text}</div>
      </li>
    )
  }

  const error = message.tone === 'error'
  const cards = message.cards?.length
    ? message.cards
    : message.kind === 'post' && message.postId
      ? [{ id: message.postId, title: message.postTitle, tag: message.tag }]
      : []
  return (
    <li className="msg msg-ai">
      <div className={error ? 'bubble bubble-ai bubble-error' : 'bubble bubble-ai'}>
        <Steps steps={message.steps} />
        {message.text ? <p className="bubble-text">{message.text}</p> : null}

        {cards.map((card, index) => (
          <button key={`${card.id}-${index}`} type="button" className="chat-card" onClick={() => onOpenPost(card.id)}>
            <span className="chat-card-main">
              <strong>{card.title || '未命名'}</strong>
              {card.tag ? <em className="chat-card-tag">{card.tag}</em> : null}
            </span>
            <span className="chat-card-open">打开</span>
          </button>
        ))}

        {message.kind === 'search' || Array.isArray(message.hits) ? (
          message.hits && message.hits.length > 0 ? (
            <ul className="chat-hits">
              {message.hits.map((hit) => (
                <li key={hit.id}>
                  <button type="button" className="hit-card" onClick={() => onOpenHit(hit.id)}>
                    <strong>{hit.title}</strong>
                    {hit.snippet ? <span className="hit-snip">{hit.snippet}</span> : null}
                    <span className="hit-meta">
                      {hit.category ? <em>{hit.category}</em> : null}
                      <span>{shortDate(hit.updatedAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chat-empty-hit">没有找到「{message.query}」相关的内容。</p>
          )
        ) : null}
      </div>
    </li>
  )
}

export function Home({
  posts,
  embedded = false,
  chat,
  onSend,
  onNewChat,
  onNavigate,
  onOpenPost,
  onOpenHit,
  onOpenSettings,
}) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)
  const threadRef = useRef(null)
  const busy = chat.busy
  const messages = chat.messages
  const empty = messages.length === 0

  useEffect(() => {
    const node = threadRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, busy])

  function submit() {
    const value = text.trim()
    if (!value || busy) return
    onSend(value)
    setText('')
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  function fillChip(chip) {
    setText(chip.fill)
    const node = inputRef.current
    if (node) {
      node.focus()
      requestAnimationFrame(() => {
        const end = node.value.length
        node.setSelectionRange(end, end)
      })
    }
  }

  return (
    <div className="chat ray">
      <div className="chat-head">
        {embedded ? null : (
          <SiteNav
            current="home"
            onNavigate={onNavigate}
            onOpenSettings={onOpenSettings}
            posts={posts}
            onOpenPost={onOpenPost}
          />
        )}
        {!empty ? (
          <div className="ray-column">
            <div className="chat-tools">
              <button type="button" className="ray-textbtn" onClick={onNewChat}>清除对话</button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="chat-thread" ref={threadRef}>
        <div className="ray-column">
          {empty ? (
            <div className="chat-hello">
              <h1 className="ray-hello">你好。</h1>
              <p className="ray-lead">说一句话就能写文章、改标题、换分类，或找回写过的内容。</p>
              <div className="ray-chips">
                {CHIPS.map((chip) => (
                  <button key={chip.label} type="button" onClick={() => fillChip(chip)}>
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="msg-list">
              {messages.map((message) => (
                <Message key={message.id} message={message} onOpenPost={onOpenPost} onOpenHit={onOpenHit} />
              ))}
              {busy ? (
                <li className="msg msg-ai">
                  <div className="bubble bubble-ai bubble-work" role="status" aria-live="polite">
                    <p className="work-phase">{chat.phase || '正在处理'}</p>
                    <Steps steps={chat.steps} live />
                  </div>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </div>

      <div className="chat-dock">
        <div className="ray-column">
          <div className={busy ? 'command is-busy' : 'command'}>
            <textarea
              ref={inputRef}
              className="command-input"
              value={text}
              rows={1}
              placeholder="发消息，例如「删除《无标题》」或「打开知识点」"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="button"
              className="command-send"
              onClick={submit}
              disabled={busy || !text.trim()}
              aria-label="发送"
            >
              {busy ? <span className="spin" /> : <SendIcon />}
            </button>
          </div>
          <span className="command-hint">Enter 发送 · Shift+Enter 换行</span>
        </div>
      </div>
    </div>
  )
}
