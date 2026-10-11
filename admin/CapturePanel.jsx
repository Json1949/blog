import { useEffect, useRef, useState } from 'react'
import { removeImage, saveImage } from '../www/db.js'
import { prepareVisionImage } from '../www/vision.js'

const MAX_LENGTH = 8000
const MAX_SHOTS = 8

async function storeShots(shots) {
  const images = []
  const savedIds = []
  try {
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
    return { images, savedIds }
  } catch (error) {
    await Promise.all(savedIds.map((id) => removeImage(id)))
    throw error
  }
}

export function CapturePanel({ onSubmit, onOpenSettings, onBack, inline = false, onBegin, onDone, onFail }) {
  const shotsRef = useRef([])
  const dragDepth = useRef(0)
  const [draft, setDraft] = useState('')
  const [shots, setShots] = useState([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => {
    shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.previewUrl))
  }, [])

  function remember(next) {
    shotsRef.current = next
    setShots(next)
  }

  function addShots(files) {
    const images = [...files].filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    const room = MAX_SHOTS - shotsRef.current.length
    if (room <= 0) {
      setError(`一次最多 ${MAX_SHOTS} 张截图。`)
      return
    }
    const accepted = images.slice(0, room).map((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    remember([...shotsRef.current, ...accepted])
    setError(images.length > room ? `一次最多 ${MAX_SHOTS} 张截图，多出来的没有加进来。` : '')
  }

  function removeShot(key) {
    const shot = shotsRef.current.find((item) => item.key === key)
    if (shot) URL.revokeObjectURL(shot.previewUrl)
    remember(shotsRef.current.filter((item) => item.key !== key))
  }

  function onPaste(event) {
    if (busy) return
    const images = [...(event.clipboardData?.items || [])]
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean)
    if (images.length === 0) return
    event.preventDefault()
    addShots(images)
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
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (busy) return
    addShots([...(event.dataTransfer?.files || [])])
  }

  async function submit(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text && shots.length === 0) {
      setError('先贴一个词、一条命令，或一张截图。')
      return
    }
    if (text.length > MAX_LENGTH) {
      setError('太长了。一次记一条命令或一个主题。')
      return
    }
    setBusy(true)
    setError('')
    onBegin?.()
    let savedIds = []
    let ok = false
    try {
      const stored = await storeShots(shots)
      savedIds = stored.savedIds
      await onSubmit({ text, images: stored.images })
      shots.forEach((shot) => URL.revokeObjectURL(shot.previewUrl))
      remember([])
      setDraft('')
      ok = true
    } catch (err) {
      await Promise.all(savedIds.map((id) => removeImage(id)))
      setError(err.message || '没能记下来。')
      onFail?.()
    } finally {
      setBusy(false)
      if (ok) onDone?.()
    }
  }

  const form = (
      <form
        className={['capture-form', dragging ? 'dragging' : '', inline ? 'inline' : ''].filter(Boolean).join(' ')}
        onSubmit={(event) => { void submit(event) }}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <label className="sr-only" htmlFor="capture-input">要记的内容</label>
        <textarea
          id="capture-input"
          className="capture-input"
          value={draft}
          placeholder=""
          maxLength={MAX_LENGTH}
          disabled={busy}
          onPaste={onPaste}
          onChange={(event) => {
            setDraft(event.target.value)
            setError('')
          }}
        />
        {shots.length > 0 ? (
          <ul className="shot-list">
            {shots.map((shot) => (
              <li className="shot" key={shot.key}>
                <img src={shot.previewUrl} alt="" />
                <button type="button" onClick={() => removeShot(shot.key)} disabled={busy}>去掉</button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="settings-actions">
          <button type="submit" className="btn btn-yellow" disabled={busy}>
            {busy ? '正在整理…' : inline ? '记一条' : '生成并记下'}
          </button>
          {inline ? null : (
            <button type="button" className="btn btn-quiet" onClick={onOpenSettings} disabled={busy}>
              设置
            </button>
          )}
        </div>
        {error ? (
          <p className="banner error" role="alert">
            {error}
            {error.includes('API Key') ? (
              <button type="button" className="text-button" onClick={onOpenSettings}>去填写</button>
            ) : null}
          </p>
        ) : null}
      </form>
  )

  if (inline) {
    return (
      <div className="quick-capture">
        {form}
      </div>
    )
  }

  return (
    <section className="paper settings-sheet capture-sheet">
      <button type="button" className="btn btn-quiet" onClick={onBack}>返回首页</button>
      <h1>记一条</h1>
      {form}
    </section>
  )
}
