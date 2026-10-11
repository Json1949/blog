import { useEffect, useRef, useState } from 'react'
import { removeImage, saveImage } from '../www/db.js'
import { generateArticle } from '../www/cursor.js'
import { MenuSelect } from './MenuSelect.jsx'

const MAX_SHOTS = 8

function prepareVisionImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const maxSide = 1600
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(url)
        reject(new Error('这张图没法读取。'))
        return
      }
      context.drawImage(image, 0, 0, width, height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (!blob) {
          reject(new Error('这张图没法读取。'))
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error || new Error('这张图没法读取。'))
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.86)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('这张图没法读取。'))
    }
    image.src = url
  })
}

export function Compose({
  settings,
  categories,
  onBack,
  onOpenSettings,
  onCreate,
  onResolveCategory,
}) {
  const shotsRef = useRef([])
  const fileRef = useRef(null)
  const [text, setText] = useState('')
  const [shots, setShots] = useState([])
  const [categoryChoice, setCategoryChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => () => {
    shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.previewUrl))
  }, [])

  function addShots(files) {
    const images = [...files].filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    const room = MAX_SHOTS - shots.length
    if (room <= 0) {
      setNotice({ type: 'error', text: `一次最多 ${MAX_SHOTS} 张截图。` })
      return
    }
    const accepted = images.slice(0, room).map((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    const next = [...shots, ...accepted]
    shotsRef.current = next
    setShots(next)
    if (images.length > room) {
      setNotice({ type: 'error', text: `一次最多 ${MAX_SHOTS} 张截图，多出来的没有加进来。` })
    }
  }

  function removeShot(key) {
    const shot = shots.find((item) => item.key === key)
    if (shot) URL.revokeObjectURL(shot.previewUrl)
    const next = shots.filter((item) => item.key !== key)
    shotsRef.current = next
    setShots(next)
  }

  function onPaste(event) {
    if (busy) return
    const images = [...(event.clipboardData?.items || [])]
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean)
    if (images.length === 0) return
    event.preventDefault()
    const pastedText = event.clipboardData.getData('text/plain')
    addShots(images)
    if (pastedText.trim()) {
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${pastedText.trim()}` : pastedText.trim()))
    }
  }

  async function readClipboard() {
    if (!navigator.clipboard?.read) {
      setNotice({ type: 'error', text: '这个浏览器不能直接读取剪贴板，在下面的框里粘贴就行。' })
      return
    }
    try {
      const items = await navigator.clipboard.read()
      const files = []
      let pastedText = ''
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          files.push(new File([blob], 'clipboard.png', { type: imageType }))
        }
        if (item.types.includes('text/plain')) {
          pastedText += await (await item.getType('text/plain')).text()
        }
      }
      if (!pastedText.trim() && files.length === 0) {
        setNotice({ type: 'error', text: '剪贴板里没有文字或截图。' })
        return
      }
      if (pastedText.trim()) {
        setText((prev) => (prev.trim() ? `${prev.trim()}\n${pastedText.trim()}` : pastedText.trim()))
      }
      addShots(files)
      setNotice(null)
    } catch {
      setNotice({ type: 'error', text: '没有读到剪贴板。在下面的框里直接粘贴就行。' })
    }
  }

  async function generate() {
    if (!text.trim() && shots.length === 0) {
      setNotice({ type: 'error', text: '先粘贴文字或截图。' })
      return
    }
    setBusy(true)
    setNotice(null)
    const savedIds = []
    try {
      const images = []
      for (const shot of shots) {
        const id = crypto.randomUUID()
        const dataUrl = await prepareVisionImage(shot.file)
        await saveImage({
          id,
          blob: shot.file,
          type: shot.file.type || 'image/png',
          createdAt: Date.now(),
        })
        savedIds.push(id)
        images.push({ id, dataUrl })
      }
      const chosen = categories.find((category) => category.id === categoryChoice)
      const categoryMode = categoryChoice === 'none'
        ? { kind: 'none' }
        : chosen
          ? { kind: 'chosen', name: chosen.name }
          : { kind: 'auto' }
      const result = await generateArticle({
        apiKey: settings.apiKey,
        text,
        images,
        categoryNames: categories.map((category) => category.name),
        categoryMode,
      })
      const categoryId = await onResolveCategory(result.category, categoryChoice)
      await onCreate({
        title: result.title,
        content: result.content,
        categoryId,
      })
    } catch (error) {
      await Promise.all(savedIds.map((id) => removeImage(id)))
      setNotice({ type: 'error', text: error.message || '没有生成文章。' })
      setBusy(false)
    }
  }

  return (
    <section className="paper settings-sheet">
      <button type="button" className="btn btn-quiet" onClick={onBack} disabled={busy}>返回</button>
      <h1>从剪贴板生成</h1>
      <p className="lead">
        把复制的文字贴进来，截图也可以直接贴。生成后会存成一篇新文章，截图留在这篇里面。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void generate()
        }}
      >
        <div className="field">
          <label htmlFor="source-text">材料</label>
          <textarea
            id="source-text"
            className="source-input"
            value={text}
            disabled={busy}
            placeholder="在这里粘贴文字。截图也可以直接粘贴，或拖进来。"
            onPaste={onPaste}
            onChange={(event) => setText(event.target.value)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (!busy) addShots(event.dataTransfer.files)
            }}
          />
          {shots.length > 0 ? (
            <ul className="shot-list">
              {shots.map((shot, index) => (
                <li className="shot" key={shot.key}>
                  <img src={shot.previewUrl} alt={`截图 ${index + 1}`} />
                  <button type="button" onClick={() => removeShot(shot.key)} disabled={busy}>移除</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="compose-category">分类</label>
          <MenuSelect
            id="compose-category"
            label="分类"
            variant="field"
            value={categoryChoice}
            disabled={busy}
            options={[
              { value: '', label: '让 AI 决定' },
              { value: 'none', label: '不分类' },
              ...categories.map((category) => ({ value: category.id, label: category.name })),
            ]}
            onChange={setCategoryChoice}
          />
          <p className="help">分类在左侧添加。选「让 AI 决定」时，会尽量放进已有分类；还没有分类时，可能新建一个。</p>
        </div>
        <div className="settings-actions">
          <button type="submit" className="btn btn-yellow" disabled={busy}>
            {busy ? '正在生成…' : '生成文章'}
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void readClipboard() }}>
            读取剪贴板
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => fileRef.current?.click()}>
            添加截图
          </button>
        </div>
        {notice ? (
          <p className={notice.type === 'error' ? 'banner error' : 'banner ok'} role={notice.type === 'error' ? 'alert' : 'status'}>
            {notice.text}
            {notice.action === 'settings' ? (
              <button type="button" className="text-button" onClick={onOpenSettings}>打开设置</button>
            ) : null}
          </p>
        ) : null}
      </form>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files || [])]
          event.target.value = ''
          addShots(files)
        }}
      />
    </section>
  )
}
