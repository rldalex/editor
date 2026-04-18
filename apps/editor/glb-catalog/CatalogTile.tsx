'use client'

import type { CatalogItem } from '@maison-3d/glb-catalog'
import clsx from 'clsx'

interface Props {
  item: CatalogItem
  onClick: (item: CatalogItem) => void
  onEdit: (item: CatalogItem) => void
}

export function CatalogTile({ item, onClick, onEdit }: Props) {
  const domainLabel = item.suggestedHADomain ?? '—'
  return (
    <button
      className={clsx(
        'group relative flex aspect-square w-full flex-col overflow-hidden rounded-md border border-border/50 bg-[#2C2C2E] text-left transition-colors hover:border-border',
      )}
      onClick={() => onClick(item)}
      type="button"
    >
      <img
        alt={item.name}
        className="h-full w-full flex-1 object-cover"
        loading="lazy"
        src={item.thumbnailUrl}
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
        <span className="truncate font-medium text-foreground text-xs">{item.name}</span>
        <span className="shrink-0 rounded bg-accent/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {domainLabel}
        </span>
      </div>
      {!item.builtin && (
        <button
          aria-label={`Modifier ${item.name}`}
          className="absolute top-1.5 right-1.5 hidden h-6 w-6 items-center justify-center rounded bg-accent/80 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:flex group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(item)
          }}
          type="button"
        >
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
        </button>
      )}
      {item.builtin && (
        <span className="absolute top-1.5 right-1.5 rounded bg-primary/80 px-1.5 py-0.5 font-mono text-[10px] text-primary-foreground">
          ex
        </span>
      )}
    </button>
  )
}
