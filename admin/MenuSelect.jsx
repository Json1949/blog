import { useEffect, useRef, useState } from 'react'

export function MenuSelect({
  id,
  value,
  options,
  label,
  onChange,
  disabled = false,
  variant = 'text',
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const current = options.find((option) => option.value === value) || options[0] || { value: '', label: '' }

  useEffect(() => {
    if (!open) return undefined
    listRef.current?.querySelector('[aria-selected="true"]')?.focus()
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function choose(next) {
    onChange(next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onListKey(event) {
    const items = [...(listRef.current?.querySelectorAll('[role="option"]') || [])]
    const index = items.indexOf(document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[Math.min(items.length - 1, index + 1)]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[Math.max(0, index - 1)]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      items[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      items[items.length - 1]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <div className={variant === 'field' ? 'menu-select field-menu' : 'menu-select'} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        className="menu-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}：${current.label}`}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((next) => !next)
        }}
        onKeyDown={(event) => {
          if (disabled) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span>{current.label}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          className="menu-select-list"
          role="listbox"
          aria-label={label}
          ref={listRef}
          onKeyDown={onListKey}
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              key={option.value || 'empty'}
              aria-selected={option.value === current.value}
              onClick={() => choose(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
