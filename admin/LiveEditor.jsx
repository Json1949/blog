import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { GFM } from '@lezer/markdown'
import { Compartment, EditorState, StateField } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  placeholder as cmPlaceholder,
  showTooltip,
} from '@codemirror/view'
import { loadImage } from '../www/db.js'
import { filterKnowledge } from '../www/mentions.js'

const imageCache = new Map()

const hideMark = Decoration.replace({})

class MentionWidget extends WidgetType {
  constructor(id, label, missing, onPeek) {
    super()
    this.id = id
    this.label = label
    this.missing = missing
    this.onPeek = onPeek
  }

  eq(other) {
    return other.id === this.id && other.label === this.label && other.missing === this.missing
  }

  toDOM() {
    const el = document.createElement(this.missing ? 'span' : 'button')
    el.className = this.missing ? 'k-mention cm-mention is-missing' : 'k-mention cm-mention'
    el.textContent = this.label
    el.contentEditable = 'false'
    if (!this.missing) {
      el.type = 'button'
      el.onmousedown = (event) => event.preventDefault()
      el.onclick = (event) => {
        event.preventDefault()
        this.onPeek?.(this.id, event)
      }
    }
    return el
  }

  ignoreEvent() {
    return true
  }
}

function openSource(view, pos, event) {
  event.preventDefault()
  view.dispatch({ selection: { anchor: pos } })
  view.focus()
}

class ImageWidget extends WidgetType {
  constructor(id, alt, pos) {
    super()
    this.id = id
    this.alt = alt
    this.pos = pos
  }

  eq(other) {
    return other.id === this.id && other.alt === this.alt
  }

  toDOM(view) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-image'
    wrap.contentEditable = 'false'
    wrap.addEventListener('mousedown', (event) => openSource(view, this.pos, event))
    const cached = imageCache.get(this.id)
    if (cached === 'missing') {
      wrap.className = 'cm-image is-missing'
      wrap.textContent = '找不到这张本地图片'
      return wrap
    }
    const img = document.createElement('img')
    img.alt = this.alt || '截图'
    wrap.appendChild(img)
    if (cached) {
      img.src = cached
    } else {
      loadImage(this.id).then((record) => {
        if (!record?.blob) {
          imageCache.set(this.id, 'missing')
          wrap.className = 'cm-image is-missing'
          wrap.textContent = '找不到这张本地图片'
          return
        }
        const url = URL.createObjectURL(record.blob)
        imageCache.set(this.id, url)
        img.src = url
      }).catch(() => {})
    }
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

function directChildren(node, names) {
  const out = []
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.includes(child.name)) out.push(child)
  }
  return out
}

function childNamed(node, name) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child
  }
  return null
}

class BulletWidget extends WidgetType {
  constructor(label) {
    super()
    this.label = label
  }

  eq(other) {
    return other.label === this.label
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-listmark'
    el.textContent = this.label
    return el
  }

  ignoreEvent() {
    return false
  }
}

class CheckWidget extends WidgetType {
  constructor(checked) {
    super()
    this.checked = checked
  }

  eq(other) {
    return other.checked === this.checked
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = this.checked ? 'cm-task is-on' : 'cm-task'
    el.textContent = this.checked ? '✓' : ''
    return el
  }

  ignoreEvent() {
    return false
  }
}

class RuleWidget extends WidgetType {
  constructor(pos) {
    super()
    this.pos = pos
  }

  eq() {
    return true
  }

  toDOM(view) {
    const el = document.createElement('hr')
    el.className = 'cm-hr'
    el.addEventListener('mousedown', (event) => openSource(view, this.pos, event))
    return el
  }

  ignoreEvent() {
    return true
  }
}

class CodeWidget extends WidgetType {
  constructor(code, lang, pos) {
    super()
    this.code = code
    this.lang = lang
    this.pos = pos
  }

  eq(other) {
    return other.code === this.code && other.lang === this.lang
  }

  toDOM(view) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-codeblock-view'
    if (this.lang) {
      const label = document.createElement('span')
      label.className = 'cm-code-lang'
      label.textContent = this.lang
      wrap.append(label)
    }
    const pre = document.createElement('pre')
    pre.textContent = this.code
    wrap.append(pre)
    wrap.addEventListener('mousedown', (event) => openSource(view, this.pos, event))
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

function appendInline(parent, text, context) {
  const re = /\[@([^\]]+)]\(k:([0-9a-f-]{36})\)\u2060?|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/gi
  let last = 0
  for (const match of text.matchAll(re)) {
    if (match.index > last) parent.append(document.createTextNode(text.slice(last, match.index)))
    if (match[2]) {
      const id = match[2].toLowerCase()
      const post = (context.posts || []).find((item) => item.id === id)
      const label = post?.title.trim() || match[1].replace(/^@/, '').trim() || '知识点'
      const el = document.createElement(post ? 'button' : 'span')
      el.className = post ? 'k-mention cm-mention' : 'k-mention cm-mention is-missing'
      el.textContent = label
      if (post) {
        el.type = 'button'
        el.onmousedown = (event) => event.preventDefault()
        el.onclick = (event) => {
          event.preventDefault()
          event.stopPropagation()
          context.onPeek?.(id, event)
        }
      }
      parent.append(el)
    } else if (match[3] != null) {
      const code = document.createElement('code')
      code.className = 'cm-code'
      code.textContent = match[3]
      parent.append(code)
    } else if (match[4] != null) {
      const strong = document.createElement('strong')
      strong.textContent = match[4]
      parent.append(strong)
    } else if (match[5] != null) {
      const em = document.createElement('em')
      em.textContent = match[5]
      parent.append(em)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)))
}

class TableWidget extends WidgetType {
  constructor(rows, context, pos) {
    super()
    this.rows = rows
    this.context = context
    this.pos = pos
    this.key = JSON.stringify(rows)
  }

  eq(other) {
    return other.key === this.key
  }

  toDOM(view) {
    const table = document.createElement('table')
    table.className = 'cm-md-table'
    const head = this.rows.filter((row) => row.header)
    const body = this.rows.filter((row) => !row.header)
    if (head.length > 0) {
      const thead = document.createElement('thead')
      for (const row of head) thead.append(this.rowEl('th', row))
      table.append(thead)
    }
    const tbody = document.createElement('tbody')
    for (const row of body) tbody.append(this.rowEl('td', row))
    table.append(tbody)
    table.addEventListener('mousedown', (event) => {
      if (event.target.closest('.k-mention')) return
      openSource(view, this.pos, event)
    })
    return table
  }

  rowEl(tag, row) {
    const tr = document.createElement('tr')
    for (const cell of row.cells) {
      const td = document.createElement(tag)
      appendInline(td, cell, this.context)
      tr.append(td)
    }
    return tr
  }

  ignoreEvent(event) {
    return Boolean(event.target?.closest?.('.k-mention'))
  }
}

function tableRows(doc, node) {
  const rows = []
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableHeader' && child.name !== 'TableRow') continue
    const cells = []
    for (let cell = child.firstChild; cell; cell = cell.nextSibling) {
      if (cell.name === 'TableCell') cells.push(doc.sliceString(cell.from, cell.to))
    }
    rows.push({ header: child.name === 'TableHeader', cells })
  }
  return rows
}

function codeParts(doc, node) {
  const raw = doc.sliceString(node.from, node.to)
  const lines = raw.split('\n')
  if (lines.length >= 2 && lines[0].startsWith('```')) {
    const closed = lines[lines.length - 1].startsWith('```')
    return {
      lang: lines[0].slice(3).trim(),
      code: lines.slice(1, closed ? -1 : undefined).join('\n'),
    }
  }
  return { lang: '', code: raw.replace(/^(?: {4}|\t)/gm, '') }
}

function coverLines(doc, from, to) {
  const start = doc.lineAt(from).from
  const endLine = doc.lineAt(Math.max(from, Math.min(to, doc.length) - 1))
  const end = endLine.to < doc.length ? endLine.to + 1 : endLine.to
  return { from: start, to: end }
}

function buildDecorations(state, context) {
  const marks = []
  const doc = state.doc
  const ranges = state.selection.ranges

  function active(from, to) {
    for (const range of ranges) {
      if (range.from <= to && range.to >= from) return true
    }
    return false
  }

  function add(from, to, deco) {
    if (to < from || from < 0 || to > doc.length) return
    marks.push(deco.range(from, to))
  }

  function hideNode(node, eatSpace) {
    let end = node.to
    if (eatSpace && doc.sliceString(end, end + 1) === ' ') end += 1
    if (end > node.from) add(node.from, end, hideMark)
  }

  function lineClass(from, to, cls) {
    const first = doc.lineAt(from).number
    const last = doc.lineAt(Math.max(from, to - 1)).number
    for (let number = first; number <= last; number += 1) {
      const line = doc.line(number)
      add(line.from, line.from, Decoration.line({ class: cls }))
    }
  }

  syntaxTree(state).iterate({
    enter(ref) {
      const { name, from, to } = ref
      const node = ref.node

      if (/^ATXHeading[1-6]$/.test(name)) {
        const level = name.slice(-1)
        const line = doc.lineAt(from)
        add(line.from, line.from, Decoration.line({ class: `cm-h${level}` }))
        if (!active(line.from, line.to)) {
          for (const mark of directChildren(node, ['HeaderMark'])) hideNode(mark, true)
        }
        return false
      }

      if (name === 'HorizontalRule') {
        if (!active(from, to)) {
          const span = coverLines(doc, from, to)
          add(span.from, span.to, Decoration.replace({ widget: new RuleWidget(from), block: true }))
        }
        return false
      }

      if (name === 'FencedCode' || name === 'CodeBlock') {
        if (!active(from, to)) {
          const { code, lang } = codeParts(doc, node)
          const span = coverLines(doc, from, to)
          add(span.from, span.to, Decoration.replace({
            widget: new CodeWidget(code, lang, from),
            block: true,
          }))
        } else {
          lineClass(from, to, 'cm-codeblock')
        }
        return false
      }

      if (name === 'Table') {
        if (!active(from, to)) {
          const span = coverLines(doc, from, to)
          add(span.from, span.to, Decoration.replace({
            widget: new TableWidget(tableRows(doc, node), context, from),
            block: true,
          }))
          return false
        }
        return
      }

      if (name === 'ListItem') {
        const mark = childNamed(node, 'ListMark')
        const task = childNamed(node, 'Task')
        if (mark && !active(doc.lineAt(mark.from).from, doc.lineAt(mark.from).to)) {
          if (task) hideNode(mark, true)
          else {
            const label = doc.sliceString(mark.from, mark.to)
            add(mark.from, mark.to, Decoration.replace({
              widget: new BulletWidget(/^\d/.test(label) ? label : '•'),
            }))
          }
        }
        return
      }

      if (name === 'TaskMarker') {
        if (!active(doc.lineAt(from).from, doc.lineAt(from).to)) {
          const checked = /[xX]/.test(doc.sliceString(from, to))
          add(from, to, Decoration.replace({ widget: new CheckWidget(checked) }))
        }
        return false
      }

      if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
        const cls = name === 'StrongEmphasis' ? 'cm-strong' : name === 'Strikethrough' ? 'cm-strike' : 'cm-em'
        add(from, to, Decoration.mark({ class: cls }))
        if (!active(from, to)) {
          const markName = name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark'
          for (const mark of directChildren(node, [markName])) hideNode(mark, false)
        }
        return
      }

      if (name === 'InlineCode') {
        add(from, to, Decoration.mark({ class: 'cm-code' }))
        if (!active(from, to)) {
          for (const mark of directChildren(node, ['CodeMark'])) hideNode(mark, false)
        }
        return false
      }

      if (name === 'Blockquote') {
        lineClass(from, to, 'cm-quote')
        if (!active(from, to)) {
          for (const mark of directChildren(node, ['QuoteMark'])) hideNode(mark, true)
        }
        return
      }

      if (name === 'Link') {
        const url = childNamed(node, 'URL')
        const urlText = url ? doc.sliceString(url.from, url.to) : ''
        if (urlText.startsWith('k:')) {
          if (!active(from, to)) {
            const id = urlText.slice(2).toLowerCase()
            const linkMarks = directChildren(node, ['LinkMark'])
            let raw = ''
            if (linkMarks.length >= 2) raw = doc.sliceString(linkMarks[0].to, linkMarks[1].from)
            raw = raw.replace(/^@/, '').replace(/[，。：、]+$/u, '').trim()
            const post = (context.posts || []).find((item) => item.id === id)
            const label = post?.title.trim() || raw || '知识点'
            add(from, to, Decoration.replace({
              widget: new MentionWidget(id, label, !post, context.onPeek),
            }))
          }
          return false
        }
        add(from, to, Decoration.mark({ class: 'cm-link' }))
        if (!active(from, to)) {
          for (const mark of directChildren(node, ['LinkMark'])) hideNode(mark, false)
          if (url) hideNode(url, false)
          const title = childNamed(node, 'LinkTitle')
          if (title) hideNode(title, false)
        }
        return false
      }

      if (name === 'Image') {
        const url = childNamed(node, 'URL')
        const urlText = url ? doc.sliceString(url.from, url.to) : ''
        if (urlText.startsWith('img:') && !active(from, to)) {
          const id = urlText.slice(4).toLowerCase()
          const linkMarks = directChildren(node, ['LinkMark'])
          let alt = ''
          if (linkMarks.length >= 2) alt = doc.sliceString(linkMarks[0].to, linkMarks[1].from)
          const line = doc.lineAt(from)
          const alone = doc.sliceString(line.from, line.to).trim() === doc.sliceString(from, to).trim()
          if (alone) {
            const span = coverLines(doc, from, to)
            add(span.from, span.to, Decoration.replace({
              widget: new ImageWidget(id, alt.replace(/^!?/, ''), from),
              block: true,
            }))
          } else {
            add(from, to, Decoration.replace({
              widget: new ImageWidget(id, alt.replace(/^!?/, ''), from),
            }))
          }
        }
        return false
      }

      return undefined
    },
  })

  try {
    return Decoration.set(marks, true)
  } catch (error) {
    console.error(error)
    return Decoration.none
  }
}

function livePreview(getContext) {
  return StateField.define({
    create(state) {
      return buildDecorations(state, getContext())
    },
    update(value, tr) {
      if (!tr.docChanged && !tr.selection) return value
      return buildDecorations(tr.state, getContext())
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}

function mentionSource(getContext) {
  return (context) => {
    const before = context.matchBefore(/@[^\s@[\]]{0,32}/)
    if (!before) return null
    if (before.from === before.to && !context.explicit) return null
    const query = before.text.slice(1)
    const library = getContext().mentionOptions || []
    const options = filterKnowledge(library, query).slice(0, 20).map((item) => {
      const safe = item.title.replace(/[[\]]/g, '').trim()
      return {
        label: item.title.trim() || '无标题',
        type: 'text',
        apply: `[@${safe}](k:${item.id}) `,
      }
    })
    if (options.length === 0) return null
    return { from: before.from, options, filter: false }
  }
}

function selectionTooltip(getContext) {
  return StateField.define({
    create: () => null,
    update(value, tr) {
      const main = tr.state.selection.main
      if (main.empty) return null
      const from = main.from
      const to = main.to
      const text = tr.state.sliceDoc(from, to)
      return {
        pos: to,
        above: false,
        strictSide: false,
        create: () => {
          const dom = document.createElement('button')
          dom.type = 'button'
          dom.className = 'cm-ai-btn'
          dom.textContent = 'AI优化'
          dom.onmousedown = (event) => event.preventDefault()
          dom.onclick = () => getContext().onOptimize?.(text, from, to)
          return { dom }
        },
      }
    },
    provide: (field) => showTooltip.from(field),
  })
}

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text)',
    backgroundColor: 'transparent',
    fontFamily: 'var(--sans)',
    fontSize: '1.0625rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--sans)',
    lineHeight: '1.85',
    overflow: 'auto',
    padding: '0',
  },
  '.cm-content': {
    width: 'min(44em, calc(100% - 48px))',
    margin: '0 auto',
    padding: '20px 0 40vh',
    caretColor: 'var(--accent)',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
})

export const LiveEditor = forwardRef(function LiveEditor(props, ref) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const propsRef = useRef(props)
  const readOnlyComp = useRef(new Compartment())
  propsRef.current = props

  useImperativeHandle(ref, () => ({
    insert(text) {
      const view = viewRef.current
      if (!view) return
      const main = view.state.selection.main
      view.dispatch({
        changes: { from: main.from, to: main.to, insert: text },
        selection: { anchor: main.from + text.length },
      })
      view.focus()
    },
    focus() {
      viewRef.current?.focus()
    },
  }), [])

  useEffect(() => {
    const getContext = () => propsRef.current
    const state = EditorState.create({
      doc: propsRef.current.value || '',
      extensions: [
        history(),
        EditorView.lineWrapping,
        markdown({
          base: markdownLanguage,
          extensions: GFM,
          addKeymap: false,
          completeHTMLTags: false,
        }),
        livePreview(getContext),
        autocompletion({ override: [mentionSource(getContext)], icons: false, defaultKeymap: false }),
        selectionTooltip(getContext),
        cmPlaceholder(propsRef.current.placeholder || ''),
        readOnlyComp.current.of(EditorState.readOnly.of(Boolean(propsRef.current.readOnly))),
        keymap.of([...markdownKeymap, ...completionKeymap, ...historyKeymap, ...defaultKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            propsRef.current.onChange?.(update.state.doc.toString())
          }
        }),
        EditorView.domEventHandlers({
          paste(event) {
            const files = [...(event.clipboardData?.items || [])]
              .filter((item) => item.type.startsWith('image/'))
              .map((item) => item.getAsFile())
              .filter(Boolean)
            if (files.length === 0) return false
            event.preventDefault()
            propsRef.current.onInsertImages?.(files)
            return true
          },
          dragover(event) {
            if ([...(event.dataTransfer?.types || [])].includes('Files')) {
              event.preventDefault()
              return true
            }
            return false
          },
          drop(event) {
            const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'))
            if (files.length === 0) return false
            event.preventDefault()
            propsRef.current.onInsertImages?.(files)
            return true
          },
        }),
        editorTheme,
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (props.value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: props.value || '' },
      })
    }
  }, [props.value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyComp.current.reconfigure(EditorState.readOnly.of(Boolean(props.readOnly))),
    })
  }, [props.readOnly])

  return <div ref={hostRef} className="live-editor" />
})
