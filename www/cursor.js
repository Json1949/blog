import { listImageIds } from './text.js'

const SYSTEM_PROMPT = `你是严谨的编辑。请优化用户给出的 Markdown 文章：理顺结构、修正语病、补上必要的小标题，让叙述更清楚。保持原意，不要编造事实，不要改变文章原来使用的语言。

图片标记必须原样保留，不要改动其中任何一个字符。它们的形式如：![截图](img:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

只返回一个 JSON 对象，不要使用代码围栏，不要附加解释。格式如下：
{"title":"优化后的标题","content":"优化后的 Markdown 正文"}`

function errorMessage(status, data) {
  if (data?.error) return data.error
  if (status === 400) return '还没有配置 Cursor API Key。'
  if (status === 401) return 'API Key 无效，请在设置里重新填写。'
  if (status === 429) return '请求太频繁，过一会儿再试。'
  return `请求失败（${status}）。`
}

export async function requestChat({ apiKey, messages, timeout }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`
  try {
    const response = await fetch('/api/cursor/chat', {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({ messages }),
    })
    const raw = await response.text()
    let data = null
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
    if (!response.ok) throw new Error(errorMessage(response.status, data))
    if (!data?.content) throw new Error('Cursor 没有返回正常结果。')
    return {
      choices: [{ message: { content: data.content }, finish_reason: 'stop' }],
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('等得太久了，可以再试一次。')
    if (error?.name === 'TypeError') {
      throw new Error('没有连上本机的 Cursor 服务。请运行 start.bat 打开这个页面。')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function stripFence(text) {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  return fenced ? fenced[1].trim() : text
}

function readOptimizePayload(text) {
  const candidate = stripFence(text.trim())
  const attempts = [candidate]
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start !== -1 && end > start) attempts.push(candidate.slice(start, end + 1))
  for (const attempt of attempts) {
    try {
      const data = JSON.parse(attempt)
      if (typeof data?.content === 'string' && data.content.trim()) {
        const title = typeof data.title === 'string' ? data.title.trim() : ''
        const category = typeof data.category === 'string' ? data.category.trim() : ''
        const kind = data.kind === '博客' ? '博客' : '知识点'
        return {
          title: title === '（无标题）' ? '' : title,
          content: data.content.trim(),
          category: category === '（空）' ? '' : category,
          kind,
        }
      }
    } catch {
      // try the next shape
    }
  }
  if (!candidate.startsWith('{') && candidate.trim()) {
    return { title: '', content: candidate.trim(), category: '' }
  }
  return null
}

const COMMAND_PROMPT = `你是「NIke的网站」的操作助手。用户的一句话可以包含好几件事。判断他要对这个网站做什么，然后只返回一个 JSON 对象（不要代码围栏，不要多余解释）。字符串里的引号和换行必须转义。不要把用户贴来的原文或代码抄进 JSON。

actions 按执行顺序排列。每项的 op 只能是：
- "create_blog"：新写一篇博客。记下网站地址也用这个。
- "create_knowledge"：新记一条知识点。
- "update"：改某一篇的正文。
- "rename"：只改某一篇的标题。
- "move"：把某一篇换到另一个分类。分类没有就新建。
- "delete"：删除某一篇。
- "add_category"：新建分类。
- "rename_category"：给分类改名。category 是现在的名字，title 是新名字。
- "delete_category"：删除分类。这个分类下的文章会变成未分类，文章本身还在。
- "open"：打开页面。target 只能是 home、blog、knowledge、new、note、settings、post。打开某一篇时 target 用 post。
- "search"：查找已有内容。

字段：
- targetId：要动的那一篇在目录里的 id。对不上就留空。
- name：目录里的现有标题，只在 targetId 留空时用来查找。
- title：新标题，不超过 24 个字，不要加书名号。create、rename、rename_category 才填。
- category：分类名。
- query：search 的关键词，用空格分隔。
- target：只有 open 需要。

如果用户要求写出、补充或扩展攻击载荷、漏洞利用步骤、提权或破解的具体命令，不要放 create_blog、create_knowledge 或 update。reply 说明不能整理这类命令，不要写出任何命令。改名、移动、删除、打开、分类这些操作照常放进 actions。

闲聊或只回答问题时，actions 用空数组，把回答放进 reply。

返回格式：
{"reply":"一句中文，说明将要做什么或你的回答","actions":[{"op":"open","target":"blog","targetId":"","name":"","title":"","category":"","query":""}]}

只返回这个 JSON 对象。`

const OPS = new Set([
  'create_blog',
  'create_knowledge',
  'update',
  'rename',
  'move',
  'delete',
  'add_category',
  'rename_category',
  'delete_category',
  'open',
  'search',
])

function readAction(data) {
  const op = typeof data?.op === 'string' ? data.op.trim() : ''
  if (!OPS.has(op)) return null
  return {
    op,
    targetId: typeof data.targetId === 'string' ? data.targetId.trim() : '',
    target: typeof data.target === 'string' ? data.target.trim() : '',
    name: typeof data.name === 'string' ? data.name.trim() : '',
    title: typeof data.title === 'string' ? data.title.trim() : '',
    category: typeof data.category === 'string' ? data.category.trim() : '',
    query: typeof data.query === 'string' ? data.query.trim() : '',
  }
}

function readCommandPayload(text) {
  const candidate = stripFence(String(text || '').trim())
  const attempts = [candidate]
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start !== -1 && end > start) attempts.push(candidate.slice(start, end + 1))
  for (const attempt of attempts) {
    try {
      const data = JSON.parse(attempt)
      if (!data || typeof data !== 'object') continue
      const reply = typeof data.reply === 'string' ? data.reply.trim() : ''
      if (Array.isArray(data.actions)) {
        return { reply, actions: data.actions.map(readAction).filter(Boolean) }
      }
      const one = readAction({ ...data, op: data.op || data.action })
      if (!one && !reply) continue
      return { reply, actions: one ? [one] : [] }
    } catch {
      // try the next shape
    }
  }
  return null
}

export function isAttackPayload(text) {
  const value = String(text || '')
  if (/SOCK_STREAM/i.test(value) && /dup2|subprocess|\/bin\/(?:sh|bash)/i.test(value)) return true
  if (/bash\s+-i\s*>&/i.test(value)) return true
  if (/\/dev\/tcp\//i.test(value)) return true
  if (/\bnc(?:at)?\b[^\n]{0,120}\s-[ec]\s+\/bin\/(?:sh|bash)/i.test(value)) return true
  if (/meterpreter|msfvenom/i.test(value)) return true
  if (/powershell[^\n]{0,80}-e(?:nc|ncodedcommand)\b/i.test(value)) return true
  return false
}

function blankAction(partial) {
  return {
    targetId: '',
    target: '',
    name: '',
    title: '',
    category: '',
    query: '',
    ...partial,
  }
}

export function localPlan(text) {
  const value = String(text || '').trim()
  const open = value.match(/^打开(对话|首页|博客|知识点|设置|记录|新建)$/)
  if (open) {
    const target = {
      对话: 'home',
      首页: 'home',
      博客: 'blog',
      知识点: 'knowledge',
      设置: 'settings',
      记录: 'note',
      新建: 'new',
    }[open[1]]
    return {
      reply: `正在打开${open[1] === '首页' || open[1] === '对话' ? '对话' : open[1]}。`,
      actions: [blankAction({ op: 'open', target })],
    }
  }
  const removed = value.match(/^删除[《「](.+?)[》」]$/)
  if (removed) {
    return {
      reply: `正在删除「${removed[1]}」。`,
      actions: [blankAction({ op: 'delete', name: removed[1] })],
    }
  }
  const renamed = value.match(/^把[《「](.+?)[》」](?:的标题)?改成[《「](.+?)[》」]$/)
  if (renamed) {
    return {
      reply: `正在把「${renamed[1]}」改成「${renamed[2]}」。`,
      actions: [blankAction({ op: 'rename', name: renamed[1], title: renamed[2] })],
    }
  }
  const moved = value.match(/^把[《「](.+?)[》」](?:放|移动)到[《「](.+?)[》」]$/)
  if (moved) {
    return {
      reply: `正在把「${moved[1]}」放入「${moved[2]}」。`,
      actions: [blankAction({ op: 'move', name: moved[1], category: moved[2] })],
    }
  }
  const added = value.match(/^(?:新建|添加)分类[《「](.+?)[》」]$/)
  if (added) {
    return {
      reply: `正在添加分类「${added[1]}」。`,
      actions: [blankAction({ op: 'add_category', category: added[1] })],
    }
  }
  return null
}

export async function interpretCommand({ apiKey, request, catalog }) {
  const listed = String(catalog || '').trim()
  const user = `${request}\n\n已有文章目录（id | 分类 | 标题）：\n${listed || '（空）'}`
  const data = await requestChat({
    apiKey,
    timeout: 180000,
    messages: [
      { role: 'system', content: COMMAND_PROMPT },
      { role: 'user', content: user },
    ],
  })
  let parsed = readCommandPayload(data.choices?.[0]?.message?.content || '')
  if (!parsed) {
    const repair = await requestChat({
      apiKey,
      timeout: 60000,
      messages: [
        {
          role: 'system',
          content: '把用户的原话改写成规定的 JSON。不要抄入任何代码。写出或扩展攻击载荷、利用步骤时，不要放写作类 op。改名、移动、删除、打开、分类仍要放进 actions。只返回 JSON。',
        },
        { role: 'user', content: `${COMMAND_PROMPT}\n\n用户原话：\n${user}` },
      ],
    })
    parsed = readCommandPayload(repair.choices?.[0]?.message?.content || '')
  }
  if (!parsed) throw new Error('没能按这句话操作。可以说「记一条知识点：…」，「删除《标题》」，或「打开博客」。')
  return parsed
}

export async function testConnection({ apiKey }) {
  const data = await requestChat({
    apiKey,
    timeout: 180000,
    messages: [{ role: 'user', content: '请只回复 OK' }],
  })
  const message = data.choices?.[0]?.message
  if (!message?.content) throw new Error('Cursor 没有返回内容。')
}

export async function optimizeArticle({ apiKey, title, content }) {
  const data = await requestChat({
    apiKey,
    timeout: 180000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `标题：\n${title.trim() || '（无标题）'}\n\n正文 Markdown：\n${content.trim() || '（空）'}`,
      },
    ],
  })
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw new Error('文章太长，这次优化被截断了。可以拆短一点再试。')
  }
  const parsed = readOptimizePayload(choice?.message?.content || '')
  if (!parsed) throw new Error('优化没有返回可用的正文，请再试一次。')
  return parsed
}

const PASSAGE_PROMPT = `你是严谨的编辑。用户给出的是文章中的一段 Markdown，不是整篇。
只重写这一段：修正语病，让它更清楚、好读。不要扩写成整篇文章，不要另起标题，除非这一段原文里已经有标题。
保持原意，不要编造事实，不要改变原来的语言。
如果里面有图片标记 ![截图](img:...)，必须原样保留，一个字符都不要改。
只返回重写后的 Markdown，不要代码围栏，不要解释。`

function plainMarkdown(text) {
  const trimmed = String(text || '').trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i)
  return (fenced ? fenced[1] : trimmed).trim()
}

function keepImageMarkers(source, next) {
  const missing = listImageIds(source).filter((id) => !next.toLowerCase().includes(id))
  if (missing.length === 0) return next
  return `${next.trim()}\n\n${missing.map((id) => `![截图](img:${id})`).join('\n\n')}`
}

const REWRITE_PROMPT = `你按用户的要求修改一篇 Markdown 文章。
只改要求里点到的部分。不要编造原文里没有的事实。不要改语言，除非用户要求翻译。
图片标记 ![截图](img:...) 必须原样保留，一个字符都不要改。
只返回一个 JSON 对象，不要代码围栏，不要解释。格式如下：
{"title":"标题","content":"Markdown 正文"}`

const DRAFT_PROMPT = `你按用户的要求写一篇 Markdown 博客。
写清楚，需要时用小标题和列表。不要编造用户没提到的事实。
不要写攻击载荷、反弹 shell、漏洞利用或未授权访问的命令。
如果用户是在记网站，正文只写网站名称、链接和一句话用途，不要写命令、参数或用法。
只返回一个 JSON 对象，不要代码围栏，不要解释。格式如下：
{"title":"标题","content":"Markdown 正文"}`

export async function writeDraft({ apiKey, request, title }) {
  const data = await requestChat({
    apiKey,
    timeout: 180000,
    messages: [
      { role: 'system', content: DRAFT_PROMPT },
      { role: 'user', content: `标题提示：${title || '（无）'}\n\n要求：\n${request}` },
    ],
  })
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw new Error('这篇太长，写作被截断了。可以把要求缩短后再试。')
  }
  const parsed = readOptimizePayload(choice?.message?.content || '')
  if (!parsed?.content) throw new Error('没有写成可用的正文，请再说具体一点。')
  return parsed
}

export async function rewriteArticle({ apiKey, title, content, instruction }) {
  const data = await requestChat({
    apiKey,
    timeout: 180000,
    messages: [
      { role: 'system', content: REWRITE_PROMPT },
      {
        role: 'user',
        content: `要求：\n${instruction}\n\n标题：\n${title.trim() || '（无标题）'}\n\n正文 Markdown：\n${content.trim() || '（空）'}`,
      },
    ],
  })
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw new Error('文章太长，这次修改被截断了。可以缩短要求后再试。')
  }
  const parsed = readOptimizePayload(choice?.message?.content || '')
  if (!parsed) throw new Error('没有改出可用的正文，请再试一次。')
  return {
    title: parsed.title,
    content: keepImageMarkers(content, parsed.content),
  }
}

export async function optimizePassage({ apiKey, passage }) {
  const data = await requestChat({
    apiKey,
    timeout: 180000,
    messages: [
      { role: 'system', content: PASSAGE_PROMPT },
      { role: 'user', content: passage },
    ],
  })
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw new Error('这一段太长，这次优化被截断了。可以少选一点再试。')
  }
  const next = keepImageMarkers(passage, plainMarkdown(choice?.message?.content || ''))
  if (!next) throw new Error('优化没有返回可用的文字，请再试一次。')
  return next
}

const GENERATE_PROMPT = `你是编辑。根据用户给出的文字、截图，或两者一起，写一篇完整的 Markdown 文章。
先看懂材料，再写成文章：要有清楚的段落，需要时用小标题和列表。
不要编造材料里没有的事实。截图里的文字、数字和界面信息可以写进文章。
不要把文章写成“这是一张截图”这种说明，直接写成读者能读的正文。
保持材料原来的语言。
如果用户给了图片标记，必须在正文相关位置原样插入，一个字符都不要改。
只返回一个 JSON 对象，不要使用代码围栏，不要附加解释。格式如下：
{"title":"标题","content":"Markdown 正文","category":"分类名或空字符串"}`

function ensureImageMarkers(content, images) {
  const missing = images.filter((image) => !content.toLowerCase().includes(image.id.toLowerCase()))
  if (missing.length === 0) return content
  const extra = missing.map((image) => `![截图](img:${image.id})`).join('\n\n')
  return `${content.trim()}\n\n${extra}`
}

const RECORD_PROMPT = `你是技术笔记编辑。用户丢来一个关键词、一条命令、一段原始记录，或若干截图。把它整理成一条可以以后检索的知识点。

要求：
- title：短标题，点明工具或主题，不超过 24 个字。不要加书名号。
- content：Markdown 正文，使用用户原来的语言。
- 先用一两句说明这是什么。
- 若用户给了命令或原文，必须原样放进一个代码块，换行、引号和反斜杠都不要改。
- 再逐项解释原文里已经出现的参数或要点。只解释用户写下的内容。
- 截图里能看见的文字、命令、报错、界面和图表可以写进正文。看不清的就不要猜。
- 不要编造运行结果，不要补充用户没写、图里也没有的目标、字典或步骤。
- 如果用户只给了一个词，就说明这个词指什么、它通常用来做什么。
- 若用户明确要求补充同一主题的常见写法，可以补上与主题直接相关、且不是攻击用途的例子。
- 如果给了图片标记 ![截图](img:...)，必须在正文相关位置原样插入，一个字符都不要改。

只返回一个 JSON 对象，不要使用代码围栏，不要附加解释。格式如下：
{"title":"标题","content":"Markdown 正文"}`

function ensureSource(content, source) {
  const normalized = source.trim()
  if (!normalized || content.includes(normalized)) return content
  return `${content.trim()}\n\n\`\`\`\n${normalized}\n\`\`\``
}

export async function recordKnowledge({ apiKey, text, images = [] }) {
  const source = String(text || '').replace(/\r\n/g, '\n').trim()
  const markers = images.map((image) => `![截图](img:${image.id})`).join('\n')
  const instruction = [
    source || '（没有文字，只根据截图整理。）',
    markers ? `必须原样插入的图片标记：\n${markers}` : '',
  ].filter(Boolean).join('\n\n')
  const userContent = images.length === 0
    ? instruction
    : [
      { type: 'text', text: instruction },
      ...images.map((image) => ({
        type: 'image_url',
        image_url: { url: image.dataUrl },
      })),
    ]
  const data = await requestChat({
    apiKey,
    timeout: images.length > 0 ? 180000 : 120000,
    messages: [
      { role: 'system', content: RECORD_PROMPT },
      { role: 'user', content: userContent },
    ],
  })
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw new Error('这条太长，整理被截断了。可以缩短后再记。')
  }
  const parsed = readOptimizePayload(choice?.message?.content || '')
  if (!parsed) throw new Error('没有整理出可用的知识点，请再试一次。')
  const title = parsed.title.replace(/[\r\n]+/g, ' ').trim().slice(0, 40)
  const fallback = source.split('\n').find((line) => line.trim()) || (images.length > 0 ? '截图' : '知识点')
  return {
    title: title || fallback.replace(/\s+/g, ' ').trim().slice(0, 40),
    content: ensureImageMarkers(ensureSource(parsed.content, source), images),
  }
}

export async function generateArticle({ apiKey, text, images, categoryNames, categoryMode }) {
  const markers = images.map((image) => `![截图](img:${image.id})`).join('\n')
  let categoryRule = 'category 留空字符串。'
  if (categoryMode.kind === 'chosen') {
    categoryRule = `用户已经指定分类「${categoryMode.name}」。category 必须原样返回这个名字。`
  } else if (categoryMode.kind === 'none') {
    categoryRule = '这篇文章不分类。category 必须是空字符串。'
  } else if (categoryNames.length > 0) {
    categoryRule = `已有分类：${categoryNames.join('、')}。category 从中选最贴切的一个；都不合适就留空字符串。不要新造分类名。`
  } else {
    categoryRule = '还没有分类。若主题明确，category 给一个不超过 8 个字的新分类名；否则留空字符串。'
  }
  const material = text.trim() || '（没有复制的文字，只根据截图写。）'
  const prompt = `${categoryRule}\n\n必须原样插入的图片标记：\n${markers || '（无）'}\n\n材料：\n${material}`
  const userContent = images.length === 0
    ? prompt
    : [
      { type: 'text', text: prompt },
      ...images.map((image) => ({
        type: 'image_url',
        image_url: { url: image.dataUrl, detail: 'high' },
      })),
    ]
  const data = await requestChat({
    apiKey,
    timeout: 180000,
    messages: [
      { role: 'system', content: GENERATE_PROMPT },
      { role: 'user', content: userContent },
    ],
  })
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') {
    throw new Error('材料太长，这次生成被截断了。可以少贴几张截图再试。')
  }
  const parsed = readOptimizePayload(choice?.message?.content || '')
  if (!parsed) throw new Error('没有生成可用的文章，请再试一次。')
  return {
    ...parsed,
    content: ensureImageMarkers(parsed.content, images),
  }
}
