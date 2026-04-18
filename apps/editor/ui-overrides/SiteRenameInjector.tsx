'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function PencilIcon() {
  return (
    <svg
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

type Anchor = { container: HTMLElement; span: HTMLSpanElement }

/**
 * Tracks Pascal's site header (`<div class="flex items-center gap-2">` holding
 * `<img alt="Site">` + the name span). Injects a pencil button / inline input
 * via portal — mirrors the `InlineRenameInput` pattern used for levels/walls
 * without modifying Pascal files.
 */
function useSiteHeaderAnchor(): Anchor | null {
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  useEffect(() => {
    const find = (): Anchor | null => {
      const img = document.querySelector<HTMLImageElement>(
        'img[alt="Site"][src*="/icons/site.png"]',
      )
      const container = img?.parentElement as HTMLElement | null
      const span = container?.querySelector<HTMLSpanElement>('span.font-medium.text-sm') ?? null
      if (!container || !span) return null
      return { container, span }
    }

    const update = () => {
      const next = find()
      setAnchor((prev) => {
        if (!prev && !next) return prev
        if (prev && next && prev.container === next.container && prev.span === next.span) {
          return prev
        }
        return next
      })
    }

    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return anchor
}

function SiteRenameControl({ span }: { span: HTMLSpanElement }) {
  const siteId = useScene((s) => {
    for (const id of s.rootNodeIds) {
      if (s.nodes[id]?.type === 'site') return id
    }
    return undefined
  })
  const name = useScene((s) => (siteId ? s.nodes[siteId]?.name : undefined))
  const updateNode = useScene((s) => s.updateNode)

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) {
      span.style.display = ''
      return
    }
    setValue(name ?? '')
    span.style.display = 'none'
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => {
      cancelAnimationFrame(frame)
      span.style.display = ''
    }
  }, [editing, name, span])

  if (!siteId) return null

  const save = () => {
    const trimmed = value.trim()
    if (trimmed !== (name ?? '')) {
      updateNode(siteId as AnyNodeId, { name: trimmed || undefined })
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="m-0 h-5 min-w-[1ch] max-w-full flex-none rounded-none border-primary/50 border-b bg-transparent px-0 py-0 font-medium text-foreground text-sm outline-none focus:border-primary"
        onBlur={save}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
          }
        }}
        placeholder="Site"
        ref={inputRef}
        size={Math.max(value.length, 1)}
        type="text"
        value={value}
      />
    )
  }

  return (
    <button
      className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      title="Renommer le site"
      type="button"
    >
      <PencilIcon />
    </button>
  )
}

export function SiteRenameInjector() {
  const anchor = useSiteHeaderAnchor()
  if (!anchor) return null

  if (!anchor.container.classList.contains('group')) {
    anchor.container.classList.add('group')
  }

  return createPortal(<SiteRenameControl span={anchor.span} />, anchor.container)
}
