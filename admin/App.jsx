import { useEffect, useRef, useState } from 'react'
import { loadCategories, loadPosts, pruneImages, removeCategory, removePost, saveCategory, savePost } from '../www/db.js'
import { seedRedWalkthrough } from '../www/seedRed.js'
import { interpretCommand, isAttackPayload, localPlan, recordKnowledge, rewriteArticle, writeDraft } from '../www/cursor.js'
import { snippetOf, titleOf } from '../www/collections.js'
import { loadSettings, saveSettings } from '../www/settings.js'
import { cleanCategoryName } from '../www/text.js'
import { AdminBar, AdminHome } from './AdminHome.jsx'
import { CapturePanel } from './CapturePanel.jsx'
import { Editor } from './Editor.jsx'
import { Home } from './Home.jsx'
import { NewSheet } from './NewSheet.jsx'
import { SettingsPanel } from './SettingsPanel.jsx'
import { Sidebar } from './Sidebar.jsx'

const SITE = 'http://127.0.0.1:5173'

const CHAT_KEY = 'nike-chat-v1'

function loadChat() {
  try {
    const raw = localStorage.getItem(CHAT_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.slice(-60) : []
  } catch {
    return []
  }
}

function readLocation() {
  const hash = window.location.hash
  const desk = { view: 'admin', id: null, filter: '' }
  if (!hash || hash === '#' || hash === '#/' || hash === '#/admin' || hash === '#/admin/') return desk
  if (hash === '#/chat' || hash === '#/admin/chat') return { view: 'home', id: null, filter: '' }
  if (hash === '#/new' || hash === '#/admin/new') return { view: 'new', id: null, filter: '' }
  if (hash === '#/note' || hash === '#/admin/note') return { view: 'capture', id: null, filter: '' }
  const edit = hash.match(/^#\/(?:admin\/)?p\/([^/?#]+)/)
  if (edit) return { view: 'edit', id: decodeURIComponent(edit[1]), filter: '' }
  return desk
}

function openSite(hash) {
  window.location.assign(`${SITE}${hash}`)
}

function replaceHash(next) {
  if (window.location.hash !== next) history.replaceState(null, '', next)
}

const PHONE_QUERY = '(max-width: 960px)'

function blankPost(post) {
  return !String(post?.title || '').trim() && !String(post?.content || '').trim()
}

function phoneMatches() {
  return window.matchMedia(PHONE_QUERY).matches
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState('')
  const [posts, setPosts] = useState([])
  const [categories, setCategories] = useState([])
  const [activeId, setActiveId] = useState(() => readLocation().id)
  const [view, setView] = useState(() => readLocation().view)
  const [categoryFilter, setCategoryFilter] = useState(() => readLocation().filter)
  const [origin, setOrigin] = useState('home')
  const [mode, setMode] = useState('edit')
  const [saveState, setSaveState] = useState('idle')
  const [narrow, setNarrow] = useState(phoneMatches)
  const [library, setLibrary] = useState(() => {
    const start = readLocation()
    return phoneMatches() && start.view === 'home'
  })
  const [settings, setSettings] = useState({ apiKey: '', model: 'grok-4.7-high-fast' })
  const [chat, setChat] = useState(() => ({ busy: false, phase: '', steps: [], messages: loadChat() }))
  const [settingsOpen, setSettingsOpen] = useState(() => window.location.hash === '#/settings')
  const [bareEditor, setBareEditor] = useState(false)
  const postsRef = useRef([])
  const categoriesRef = useRef([])
  const persistedRef = useRef(new Set())
  const runRef = useRef(0)
  const timersRef = useRef(new Map())

  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  useEffect(() => {
    const start = readLocation()
    let cancelled = false
    loadPosts().then(async (rows) => {
      const storedCategories = await loadCategories()
      if (cancelled) return
      let nextPosts = rows
      let nextCategories = storedCategories
      try {
        const seeded = await seedRedWalkthrough(rows, storedCategories)
        if (cancelled) return
        if (seeded) {
          nextPosts = seeded.posts
          nextCategories = seeded.categories
        }
      } catch {
        nextPosts = rows
        nextCategories = storedCategories
      }
      const storedSettings = await loadSettings()
      if (cancelled) return
      postsRef.current = nextPosts
      persistedRef.current = new Set(nextPosts.map((post) => post.id))
      categoriesRef.current = nextCategories
      setSettings(storedSettings)
      setPosts(nextPosts)
      setCategories(nextCategories)
      if (start.id && !nextPosts.some((post) => post.id === start.id)) {
        setActiveId(null)
        setView('admin')
        setCategoryFilter('')
      }
      setReady(true)
    }).catch(() => {
      if (!cancelled) setBootError('文章没能读出来。请运行 start.bat。')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function syncFromHash() {
      const next = readLocation()
      setView(next.view)
      setActiveId(next.id)
      setCategoryFilter(next.filter || '')
      if (!phoneMatches()) return
      const desk = next.view === 'admin' || next.view === 'home' || next.view === 'new' || next.view === 'capture'
      setLibrary(desk)
    }
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY)
    function onChange() {
      const phone = query.matches
      setNarrow(phone)
      if (!phone) return
      const next = readLocation()
      setLibrary(next.view === 'home')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(chat.messages.slice(-60)))
    } catch {
      /* storage unavailable, keep chat in memory only */
    }
  }, [chat.messages])

  useEffect(() => {
    if (!ready) return
    if (view === 'admin') {
      replaceHash('#/')
      return
    }
    if (view === 'home') {
      replaceHash('#/chat')
      return
    }
    if (view === 'capture') {
      replaceHash('#/note')
      return
    }
    if (view === 'new') {
      replaceHash('#/new')
      return
    }
    const exists = Boolean(activeId && posts.some((post) => post.id === activeId))
    if (!exists) {
      setView('admin')
      setActiveId(null)
      return
    }
    replaceHash(`#/p/${activeId}`)
  }, [ready, view, activeId, posts, categoryFilter])

  useEffect(() => {
    const post = posts.find((item) => item.id === activeId)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f7f6f3')
    if (view === 'home') document.title = '对话 · NIke的网站'
    else if (view === 'capture') document.title = '记一条 · NIke的网站'
    else if (view === 'new') document.title = '新建 · NIke的网站'
    else if (view === 'edit') document.title = post?.title.trim() ? `${post.title.trim()} · NIke的网站` : '编辑 · NIke的网站'
    else document.title = '后台 · NIke的网站'
  }, [posts, activeId, view, categoryFilter])

  useEffect(() => {
    if (!settingsOpen) return undefined
    document.getElementById('api-key')?.focus()
    function onKey(event) {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  useEffect(() => {
    function flushPending() {
      const ids = [...timersRef.current.keys()]
      for (const [id, timer] of timersRef.current) {
        clearTimeout(timer)
        timersRef.current.delete(id)
      }
      if (ids.length === 0) return
      setSaveState('saving')
      Promise.all(ids.map((id) => {
        const post = postsRef.current.find((item) => item.id === id)
        return post ? storePost(post) : null
      }))
        .then(() => pruneImages(postsRef.current))
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        flushPending()
      }
    }
    window.addEventListener('pagehide', flushPending)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pagehide', flushPending)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  function storePost(post) {
    if (blankPost(post)) {
      if (!persistedRef.current.has(post.id)) return Promise.resolve()
      persistedRef.current.delete(post.id)
      return removePost(post.id)
    }
    return savePost(post).then(() => {
      persistedRef.current.add(post.id)
    })
  }

  function scheduleSave(id) {
    const timers = timersRef.current
    clearTimeout(timers.get(id))
    const current = postsRef.current.find((item) => item.id === id)
    if (current && blankPost(current) && !persistedRef.current.has(id)) {
      setSaveState('idle')
      return
    }
    setSaveState('saving')
    const timer = setTimeout(() => {
      timers.delete(id)
      const latest = postsRef.current.find((item) => item.id === id)
      if (!latest) return
      storePost(latest)
        .then(() => pruneImages(postsRef.current))
        .then(() => setSaveState(blankPost(latest) ? 'idle' : 'saved'))
        .catch(() => setSaveState('error'))
    }, 400)
    timers.set(id, timer)
  }

  function updatePost(id, partial) {
    const next = postsRef.current.map((post) => (
      post.id === id ? { ...post, ...partial, updatedAt: Date.now() } : post
    ))
    postsRef.current = next
    setPosts(next)
    scheduleSave(id)
  }

  function updateActive(partial) {
    if (!activeId) return
    updatePost(activeId, partial)
  }

  async function createPost(partial = {}, { open = true, mode = 'edit', from } = {}) {
    const post = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      categoryId: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...partial,
    }
    if (!blankPost(post)) {
      await savePost(post)
      persistedRef.current.add(post.id)
      setSaveState('saved')
    } else {
      setSaveState('idle')
    }
    setPosts((prev) => [post, ...prev.filter((item) => item.id !== post.id)])
    postsRef.current = [post, ...postsRef.current.filter((item) => item.id !== post.id)]
    if (open) {
      if (from) setOrigin(from)
      setBareEditor(true)
      setActiveId(post.id)
      setView('edit')
      setMode(mode)
      setLibrary(false)
    }
    return post
  }

  async function addCategory(name) {
    const cleaned = cleanCategoryName(name)
    if (!cleaned) return null
    const existing = categoriesRef.current.find((category) => category.name === cleaned)
    if (existing) throw new Error('已经有这个分类。')
    const category = { id: crypto.randomUUID(), name: cleaned, createdAt: Date.now() }
    await saveCategory(category)
    const next = [...categoriesRef.current, category]
    categoriesRef.current = next
    setCategories(next)
    return category
  }

  async function renameCategory(id, name) {
    const cleaned = cleanCategoryName(name)
    if (!cleaned) throw new Error('先写分类名。')
    const current = categoriesRef.current.find((category) => category.id === id)
    if (!current) return
    if (current.name === cleaned) return
    if (categoriesRef.current.some((category) => category.id !== id && category.name === cleaned)) {
      throw new Error('已经有这个分类。')
    }
    const nextCategory = { ...current, name: cleaned }
    await saveCategory(nextCategory)
    const next = categoriesRef.current.map((category) => (category.id === id ? nextCategory : category))
    categoriesRef.current = next
    setCategories(next)
  }

  async function deleteCategory(id) {
    await removeCategory(id)
    const nextCategories = categoriesRef.current.filter((category) => category.id !== id)
    categoriesRef.current = nextCategories
    setCategories(nextCategories)
    const affected = postsRef.current.filter((post) => post.categoryId === id)
    if (affected.length === 0) return
    const nextPosts = postsRef.current.map((post) => (
      post.categoryId === id ? { ...post, categoryId: '' } : post
    ))
    postsRef.current = nextPosts
    setPosts(nextPosts)
    await Promise.all(affected.map((post) => savePost({ ...post, categoryId: '' })))
  }

  function discardBlank(id) {
    const post = postsRef.current.find((item) => item.id === id)
    if (!post || !blankPost(post)) return
    clearTimeout(timersRef.current.get(id))
    timersRef.current.delete(id)
    const next = postsRef.current.filter((item) => item.id !== id)
    postsRef.current = next
    setPosts(next)
    if (activeId === id) setActiveId(null)
    if (persistedRef.current.has(id)) {
      persistedRef.current.delete(id)
      void removePost(id).then(() => pruneImages(postsRef.current))
    }
  }

  function leaveEditor() {
    if (activeId) discardBlank(activeId)
    setBareEditor(false)
    setView('admin')
    setLibrary(false)
  }

  const viewRef = useRef(view)
  useEffect(() => {
    const previous = viewRef.current
    viewRef.current = view
    if (!ready || previous !== 'edit' || view === 'edit') return
    if (activeId) discardBlank(activeId)
  }, [view, ready, activeId])

  async function deletePost(id) {
    const removed = postsRef.current.find((post) => post.id === id)
    const leave = view === 'edit' && activeId === id
    clearTimeout(timersRef.current.get(id))
    timersRef.current.delete(id)
    const next = postsRef.current.filter((post) => post.id !== id)
    postsRef.current = next
    setPosts(next)
    if (activeId === id) setActiveId(null)
    if (leave) leaveEditor()
    await removePost(id)
    await pruneImages(next)
  }

  function updateSettings(next) {
    setSettings(next)
    saveSettings(next)
  }

  const active = posts.find((post) => post.id === activeId) || null

  if (bootError) {
    return <div className="boot"><p>{bootError}</p></div>
  }
  if (!ready) {
    return <div className="boot"><p>正在打开本地文章…</p></div>
  }

  function openHome() {
    if (view === 'edit' && activeId) discardBlank(activeId)
    setBareEditor(false)
    setView('admin')
    setLibrary(true)
  }

  function openPublic() {
    openSite('#/')
  }

  function showPost(id) {
    openSite(`#/p/${id}`)
  }

  function navigate(section) {
    if (section === 'home') {
      setView('home')
      setLibrary(false)
      return
    }
    if (section === 'blog' || section === 'public') {
      openPublic()
      return
    }
    if (section === 'knowledge') {
      openSite('#/k')
      return
    }
    if (section === 'admin') {
      setView('admin')
      return
    }
    setView(section)
    setLibrary(false)
  }

  function openNew() {
    setView('new')
    setLibrary(false)
  }

  function goBack() {
    if (view === 'edit') {
      leaveEditor()
      return
    }
    openHome()
  }

  function backLabel() {
    return '返回后台'
  }

  function openPost(id, from) {
    if (activeId && activeId !== id) discardBlank(activeId)
    const post = postsRef.current.find((item) => item.id === id)
    setOrigin(from || 'admin')
    setBareEditor(false)
    if (!post && !from) return
    setActiveId(id)
    setView('edit')
    setLibrary(false)
    setMode(from === 'read' ? 'read' : 'edit')
  }

  function openSettings() {
    setSettingsOpen(true)
  }

  function openCapture() {
    setView('capture')
    setLibrary(false)
  }

  function closeSettings() {
    setSettingsOpen(false)
  }

  async function ensureBlogCategory() {
    const existing = categoriesRef.current.find((category) => category.name === '博客')
    if (existing) return existing
    const category = { id: crypto.randomUUID(), name: '博客', createdAt: Date.now() }
    await saveCategory(category)
    const next = [...categoriesRef.current, category]
    categoriesRef.current = next
    setCategories(next)
    return category
  }

  async function createBlogPost() {
    const blog = await ensureBlogCategory()
    await createPost({ categoryId: blog.id }, { from: 'blog', mode: 'edit' })
  }

  function searchPosts(query) {
    const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return []
    const categoryName = (id) => categoriesRef.current.find((category) => category.id === id)?.name || ''
    return postsRef.current
      .map((post) => {
        const haystack = `${post.title}\n${post.content}`.toLowerCase()
        const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0)
        return { post, score }
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || b.post.updatedAt - a.post.updatedAt)
      .slice(0, 8)
      .map(({ post }) => ({
        id: post.id,
        title: titleOf(post),
        snippet: snippetOf(post.content),
        category: categoryName(post.categoryId),
        updatedAt: post.updatedAt,
      }))
  }

  function finishChat(run, message, steps) {
    if (runRef.current !== run) return
    setChat((current) => ({
      busy: false,
      phase: '',
      steps: [],
      messages: [...current.messages, { id: crypto.randomUUID(), steps, ...message }],
    }))
  }

  function clearChat() {
    runRef.current += 1
    setChat({ busy: false, phase: '', steps: [], messages: [] })
  }

  function catalogText() {
    const names = categoriesRef.current.map((category) => category.name).join('、') || '（无）'
    const rows = postsRef.current
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 80)
      .map((post) => {
        const name = categoriesRef.current.find((category) => category.id === post.categoryId)?.name || '未分类'
        return `${post.id} | ${name} | ${titleOf(post)}`
      })
      .join('\n')
    return `分类：${names}\n\n文章（id | 分类 | 标题）：\n${rows || '（空）'}`
  }

  function categoryByName(name) {
    const cleaned = cleanCategoryName(name)
    if (!cleaned) return null
    return categoriesRef.current.find((category) => category.name === cleaned) || null
  }

  function postByAction(action) {
    if (action.targetId) {
      const byId = postsRef.current.find((post) => post.id === action.targetId)
      if (byId) return byId
    }
    const name = action.name.trim()
    if (!name) return null
    const exact = postsRef.current.filter((post) => post.title.trim() === name)
    if (exact.length === 1) return exact[0]
    const loose = postsRef.current.filter((post) => post.title.includes(name))
    return loose.length === 1 ? loose[0] : null
  }

  async function sendChat(request) {
    const text = request.trim()
    if (!text || chat.busy) return
    const run = runRef.current + 1
    runRef.current = run
    const steps = ['正在理解你的话']
    const step = (label) => {
      if (runRef.current !== run) return
      if (!steps.includes(label)) steps.push(label)
      setChat((current) => (
        runRef.current === run ? { ...current, phase: label, steps: [...steps] } : current
      ))
    }
    setChat((current) => ({
      busy: true,
      phase: steps[0],
      steps: [...steps],
      messages: [...current.messages, { id: crypto.randomUUID(), role: 'user', text }],
    }))
    const alive = () => runRef.current === run
    try {
      if (isAttackPayload(text)) {
        step('这条不能整理')
        finishChat(run, {
          role: 'assistant',
          kind: 'text',
          text: '这段是攻击载荷。我不会把它记进知识点，也不会补充同类写法。',
        }, [...steps])
        return
      }
      const plan = localPlan(text) || await interpretCommand({
        apiKey: settings.apiKey,
        request: text,
        catalog: catalogText(),
      })
      if (!alive()) return
      if (isAttackPayload(plan.reply)) {
        step('这条不能整理')
        finishChat(run, {
          role: 'assistant',
          kind: 'text',
          text: '这段是攻击载荷。我不会把它写进网站，也不会补充同类写法。',
        }, [...steps])
        return
      }
      const notes = []
      const cards = []
      let hits = null
      let query = ''
      const blocked = '这一步没有写：我不会整理攻击载荷或同类写法。'
      for (const action of plan.actions) {
        if (!alive()) return
        try {
          if (action.op === 'create_blog') {
            step('正在写博客')
            const draft = await writeDraft({ apiKey: settings.apiKey, request: text, title: action.title })
            if (!alive()) return
            if (isAttackPayload(draft.content) || isAttackPayload(draft.title)) {
              notes.push(blocked)
              continue
            }
            step('正在归档到「博客」')
            const blog = await ensureBlogCategory()
            const post = await createPost({
              title: draft.title || action.title,
              content: draft.content,
              categoryId: blog.id,
            }, { open: false })
            cards.push({ id: post.id, title: titleOf(post), tag: '博客' })
            continue
          }
          if (action.op === 'create_knowledge') {
            step('正在整理知识点')
            const material = text.replace(/^(请)?(帮我)?(把)?(记一条知识点|记到知识点|记成知识点|记一条|整理成知识点)[:：，,\s]*/u, '').trim() || text
            const note = await recordKnowledge({ apiKey: settings.apiKey, text: material })
            if (!alive()) return
            if (isAttackPayload(note.content) || isAttackPayload(note.title)) {
              notes.push(blocked)
              continue
            }
            step('正在写入「知识点」')
            const category = await ensureKnowledgeCategory()
            const post = await createPost({
              title: note.title || action.title,
              content: note.content,
              categoryId: category.id,
            }, { open: false })
            cards.push({ id: post.id, title: titleOf(post), tag: '知识点' })
            continue
          }
          if (action.op === 'update') {
            const target = postByAction(action)
            if (!target) {
              notes.push('没找到要改的那一篇。')
              continue
            }
            step(`正在修改「${titleOf(target)}」`)
            const rewritten = await rewriteArticle({
              apiKey: settings.apiKey,
              title: target.title,
              content: target.content,
              instruction: text,
            })
            if (!alive()) return
            if (isAttackPayload(rewritten.content)) {
              notes.push(blocked)
              continue
            }
            updatePost(target.id, {
              title: rewritten.title || target.title,
              content: rewritten.content,
            })
            cards.push({
              id: target.id,
              title: titleOf({ ...target, title: rewritten.title || target.title }),
              tag: '已修改',
            })
            continue
          }
          if (action.op === 'rename') {
            const target = postByAction(action)
            const nextTitle = action.title.trim()
            if (!target || !nextTitle) {
              notes.push('没找到要改名的文章，或没有新标题。')
              continue
            }
            step(`正在改名「${titleOf(target)}」`)
            updatePost(target.id, { title: nextTitle })
            cards.push({ id: target.id, title: nextTitle, tag: '已改名' })
            continue
          }
          if (action.op === 'move') {
            const target = postByAction(action)
            if (!target) {
              notes.push('没找到要移动的文章。')
              continue
            }
            let category = categoryByName(action.category)
            if (!category) category = await addCategory(action.category)
            if (!category) {
              notes.push('没有写成分类。')
              continue
            }
            step(`正在把「${titleOf(target)}」放入「${category.name}」`)
            updatePost(target.id, { categoryId: category.id })
            cards.push({ id: target.id, title: titleOf(target), tag: category.name })
            continue
          }
          if (action.op === 'delete') {
            const target = postByAction(action)
            if (!target) {
              notes.push('没找到要删除的文章。')
              continue
            }
            const label = titleOf(target)
            step(`正在删除「${label}」`)
            await deletePost(target.id)
            notes.push(`已删除「${label}」。`)
            continue
          }
          if (action.op === 'add_category') {
            const category = await addCategory(action.category)
            if (!category) {
              notes.push('先写出分类名。')
              continue
            }
            step(`已添加分类「${category.name}」`)
            notes.push(`已添加分类「${category.name}」。`)
            continue
          }
          if (action.op === 'rename_category') {
            const category = categoryByName(action.category)
            if (!category) {
              notes.push('没找到这个分类。')
              continue
            }
            await renameCategory(category.id, action.title)
            step(`已把分类改成「${cleanCategoryName(action.title)}」`)
            notes.push(`已把分类「${category.name}」改成「${cleanCategoryName(action.title)}」。`)
            continue
          }
          if (action.op === 'delete_category') {
            const category = categoryByName(action.category)
            if (!category) {
              notes.push('没找到这个分类。')
              continue
            }
            const label = category.name
            await deleteCategory(category.id)
            step(`已删除分类「${label}」`)
            notes.push(`已删除分类「${label}」。里面的文章还在，只是不再归到这个分类。`)
            continue
          }
          if (action.op === 'open') {
            step('正在打开')
            if (action.target === 'home') openHome()
            else if (action.target === 'blog' || action.target === 'knowledge' || action.target === 'new') navigate(action.target)
            else if (action.target === 'note') openCapture()
            else if (action.target === 'settings') openSettings()
            else {
              const target = postByAction(action)
              if (!target) {
                notes.push('没找到要打开的文章。')
                continue
              }
              openPost(target.id)
              cards.push({ id: target.id, title: titleOf(target), tag: '已打开' })
            }
            continue
          }
          if (action.op === 'search') {
            step('正在查找')
            query = action.query || text
            const found = searchPosts(query)
            const seen = new Set((hits || []).map((hit) => hit.id))
            hits = [...(hits || []), ...found.filter((hit) => !seen.has(hit.id))]
          }
        } catch (error) {
          notes.push(error.message || '有一步没做成。')
        }
      }
      if (!alive()) return
      const spoken = [plan.reply, ...notes].filter(Boolean).join('\n')
      finishChat(run, {
        role: 'assistant',
        kind: hits ? 'search' : cards.length ? 'post' : 'text',
        text: spoken || (plan.actions.length ? '做好了。' : '我没有改动任何内容。'),
        query,
        hits,
        cards,
        postId: cards[0]?.id,
        postTitle: cards[0]?.title,
        tag: cards[0]?.tag,
      }, [...steps])
    } catch (error) {
      if (!alive()) return
      finishChat(run, {
        role: 'assistant',
        kind: 'text',
        tone: 'error',
        text: error.message || '没能完成这次操作。',
      }, [...steps])
    }
  }

  async function createKnowledgePost() {
    const category = await ensureKnowledgeCategory()
    await createPost({ categoryId: category.id }, { from: 'knowledge', mode: 'edit' })
  }

  async function ensureKnowledgeCategory() {
    const existing = categoriesRef.current.find((category) => category.name === '知识点')
    if (existing) return existing
    const category = { id: crypto.randomUUID(), name: '知识点', createdAt: Date.now() }
    await saveCategory(category)
    const next = [...categoriesRef.current, category]
    categoriesRef.current = next
    setCategories(next)
    return category
  }

  async function recordNote({ text, images, open = true }) {
    if (isAttackPayload(text)) {
      throw new Error('这段是攻击载荷。我不会把它记进知识点，也不会补充同类写法。')
    }
    const note = await recordKnowledge({
      apiKey: settings.apiKey,
      text,
      images,
    })
    if (isAttackPayload(note.content)) {
      throw new Error('这段是攻击载荷。我不会把它记进知识点，也不会补充同类写法。')
    }
    const category = await ensureKnowledgeCategory()
    await createPost({
      title: note.title,
      content: note.content,
      categoryId: category.id,
    }, { open, mode: 'read', from: 'knowledge' })
  }

  const desk = view === 'admin' || view === 'home' || view === 'new' || view === 'capture'
  const editing = view === 'edit'
  const shell = desk
    ? 'app home-shell'
    : bareEditor
      ? 'app edit-shell'
      : !narrow ? 'app' : library ? 'app phone-library' : 'app phone-sheet'

  return (
    <div className={shell}>
      {editing && !narrow && !bareEditor ? (
        <Sidebar
          posts={posts}
          categories={categories}
          activeId={activeId}
          settingsOpen={settingsOpen}
          captureOpen={false}
          onHome={openHome}
          onCreatePost={() => { void createPost() }}
          onSelect={(id) => openPost(id)}
          onDelete={(id) => { void deletePost(id) }}
          onOpenSettings={openSettings}
          onOpenCapture={openCapture}
        />
      ) : null}
      <main className="stage">
        {narrow && editing && !library ? (
          <div className="mobile-bar">
            <button type="button" className="mobile-back" onClick={goBack}>
              {backLabel()}
            </button>
          </div>
        ) : null}
        {view === 'admin' ? (
          <AdminHome
            posts={posts}
            categories={categories}
            onEdit={(id) => openPost(id)}
            onView={showPost}
            onDelete={(id) => { void deletePost(id) }}
            onCreate={() => { void createPost() }}
            onChat={() => setView('home')}
            onCapture={openCapture}
            onSettings={openSettings}
            onFront={openPublic}
          />
        ) : null}
        {view === 'capture' ? (
          <>
            <AdminBar title="截图记录" onBack={openHome} />
            <CapturePanel
              onSubmit={recordNote}
              onOpenSettings={openSettings}
              onBack={openHome}
            />
          </>
        ) : null}
        {view === 'new' ? (
          <>
            <AdminBar title="新建" onBack={openHome} />
            <NewSheet
              onBack={openHome}
              onCreatePost={() => { void createPost({}, { from: 'admin' }) }}
              onAddCategory={addCategory}
            />
          </>
        ) : null}
        {view === 'home' ? (
          <>
            <AdminBar title="对话" onBack={openHome} />
            <Home
              embedded
              posts={posts}
              chat={chat}
              onSend={(request) => { void sendChat(request) }}
              onNewChat={clearChat}
              onNavigate={navigate}
              onOpenPost={(id) => openPost(id)}
              onOpenHit={(id) => openPost(id)}
              onOpenSettings={openSettings}
            />
          </>
        ) : null}
        {view === 'edit' && active ? (
          <Editor
            key={active.id}
            post={active}
            posts={posts}
            saveState={saveState}
            settings={settings}
            categories={categories}
            mode={mode}
            onChange={updateActive}
            onMode={setMode}
            onBack={goBack}
            backLabel={backLabel()}
            onOpenSettings={openSettings}
            onCreateCategory={addCategory}
            onOpenPost={(id) => openPost(id)}
          />
        ) : null}
      </main>
      {settingsOpen ? (
        <>
          <button type="button" className="note-shade" aria-label="关闭" onClick={closeSettings} />
          <div className="note-card settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="note-head">
              <h2 id="settings-title">设置</h2>
              <button type="button" className="text-action" onClick={closeSettings}>关闭</button>
            </div>
            <SettingsPanel settings={settings} onChange={updateSettings} />
          </div>
        </>
      ) : null}
    </div>
  )
}
