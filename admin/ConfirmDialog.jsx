import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function ConfirmDialog({ title, body, confirmLabel = '删除', onConfirm, onCancel }) {
  const cancelRef = useRef(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    cancelRef.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') onCancelRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return createPortal(
    <>
      <button type="button" className="note-shade" aria-label="取消" onClick={onCancel} />
      <div className="note-card confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        {body ? <p className="confirm-copy">{body}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="btn btn-quiet" ref={cancelRef} onClick={onCancel}>取消</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </>,
    document.body,
  )
}
