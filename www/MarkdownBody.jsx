import { useEffect, useRef, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { loadImage } from './db.js'
import { citationsOf } from './mentions.js'

const objectUrls = new Map()

function urlTransform(url) {
  if (url.startsWith('img:') || url.startsWith('k:')) return url
  return defaultUrlTransform(url)
}

function Table({ children }) {
  return (
    <div className="table-scroll">
      <table>{children}</table>
    </div>
  )
}

function CodeBlock({ children }) {
  const preRef = useRef(null)
  const timer = useRef(0)
  const [state, setState] = useState('idle')

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    const text = (preRef.current?.innerText || '').replace(/\s+$/u, '')
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.left = '-9999px'
        document.body.appendChild(area)
        area.select()
        ok = document.execCommand('copy')
        area.remove()
      } catch {
        ok = false
      }
    }
    setState(ok ? 'copied' : 'failed')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 1600)
  }

  const label = state === 'copied' ? '已复制' : state === 'failed' ? '没复制上' : '复制'

  return (
    <div className="code-block">
      <button
        type="button"
        className={state === 'copied' ? 'code-copy is-done' : 'code-copy'}
        onClick={() => { void copy() }}
      >
        {label}
      </button>
      <pre ref={preRef}>{children}</pre>
    </div>
  )
}

function remarkBreaks() {
  return (tree) => {
    walkBreaks(tree)
  }
}

function walkBreaks(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.children)) return
  const next = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('\n')) {
      const parts = child.value.split('\n')
      parts.forEach((part, index) => {
        if (index > 0) next.push({ type: 'break' })
        if (part) next.push({ type: 'text', value: part })
      })
      continue
    }
    walkBreaks(child)
    next.push(child)
  }
  node.children = next
}

function glueMentions(markdown) {
  return String(markdown || '').replace(
    /\[@([^\]]+)]\(k:([0-9a-f-]{36})\)\u2060?([，。：、])/gi,
    '[@$1$3](k:$2)',
  )
}

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node?.props?.children) return textOf(node.props.children)
  return ''
}

function ExternalLink({ href, children }) {
  const external = Boolean(href && /^https?:/i.test(href))
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {children}
    </a>
  )
}

function LocalImage({ src, alt }) {
  const localId = src?.startsWith('img:') ? src.slice(4).toLowerCase() : ''
  const [loaded, setLoaded] = useState(null)
  const cached = localId ? objectUrls.get(localId) || '' : ''
  const value = loaded?.id === localId ? loaded.value : cached

  useEffect(() => {
    if (!localId || objectUrls.get(localId)) return undefined
    let cancelled = false
    loadImage(localId).then((record) => {
      if (cancelled) return
      if (!record?.blob) {
        setLoaded({ id: localId, value: 'missing' })
        return
      }
      const url = URL.createObjectURL(record.blob)
      objectUrls.set(localId, url)
      setLoaded({ id: localId, value: url })
    }).catch(() => {
      if (!cancelled) setLoaded({ id: localId, value: 'missing' })
    })
    return () => {
      cancelled = true
    }
  }, [localId])

  if (!localId) {
    if (!src) return null
    return <img src={src} alt={alt || ''} />
  }
  if (value === 'missing') return <span className="missing-image">找不到这张本地图片</span>
  if (!value) return <span className="missing-image">正在读取图片…</span>
  return <img src={value} alt={alt || '截图'} />
}

function KnowledgeLink({ href, children, posts, onPeek }) {
  const id = href.slice(2).toLowerCase()
  const post = posts.find((item) => item.id === id)
  const raw = textOf(children).replace(/^@/, '')
  const label = post?.title.trim() || raw.replace(/[，。：、]+$/u, '') || '知识点'
  const suffix = (raw.match(/[，。：、]+$/u) || [''])[0]
  if (!post || !onPeek) return <span className="k-mention is-missing">{label}{suffix}</span>
  const cited = citationsOf(id, posts).length
  const citedLabel = cited > 0 ? `${cited} 篇文章引用了这条` : '还没有文章引用这条'
  return (
    <button
      type="button"
      className="k-mention"
      title={citedLabel}
      aria-label={`查看知识点 ${label}`}
      onClick={(event) => onPeek(id, event)}
    >
      {label}{suffix}
    </button>
  )
}

export function MarkdownBody({ content, posts = [], onPeek }) {
  function Link(props) {
    if (props.href?.startsWith('k:')) {
      return <KnowledgeLink {...props} posts={posts} onPeek={onPeek} />
    }
    return <ExternalLink {...props} />
  }

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={urlTransform}
        components={{ img: LocalImage, a: Link, pre: CodeBlock, table: Table }}
      >
        {glueMentions(content)}
      </ReactMarkdown>
    </div>
  )
}
