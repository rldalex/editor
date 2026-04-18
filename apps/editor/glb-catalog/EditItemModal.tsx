'use client'

import {
  type CatalogItem,
  type Category,
  type HADomainHint,
  deleteGLB,
  regenerateThumbnail,
  replaceThumbnail,
  updateGLBMeta,
} from '@maison-3d/glb-catalog'
import { useScene } from '@pascal-app/core'
import { useRef, useState } from 'react'

const CATEGORY_OPTIONS: Array<{ value: Category; label: string }> = [
  { value: 'light', label: 'Lumière' },
  { value: 'cover', label: 'Volet' },
  { value: 'sensor', label: 'Capteur' },
  { value: 'furniture', label: 'Meuble' },
  { value: 'uncategorized', label: 'Non classé' },
]

const DOMAIN_OPTIONS: Array<{ value: HADomainHint; label: string }> = [
  { value: 'light', label: 'light' },
  { value: 'switch', label: 'switch' },
  { value: 'cover', label: 'cover' },
  { value: 'fan', label: 'fan' },
  { value: 'climate', label: 'climate' },
  { value: 'sensor', label: 'sensor' },
  { value: null, label: '—' },
]

const DEFAULT_DOMAIN_FOR_CATEGORY: Record<Category, HADomainHint> = {
  light: 'light',
  cover: 'cover',
  sensor: 'sensor',
  furniture: null,
  uncategorized: null,
}

interface Props {
  item: CatalogItem
  onClose: () => void
}

export function EditItemModal({ item, onClose }: Props) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState<Category>(item.category)
  const [domain, setDomain] = useState<HADomainHint>(item.suggestedHADomain)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Usage count : match par asset.src === pascalAssetUrl (bijectif, robuste).
  // On n'ajoute PAS metadata.glbSource au ItemNode (Pascal ne propage pas
  // AssetInput.metadata vers ItemNode.metadata — on éviterait d'avoir à
  // intercepter createNode). Le match URL suffit.
  const usageCount = useScene((s) => {
    let count = 0
    for (const node of Object.values(s.nodes)) {
      if (node.type !== 'item') continue
      const itemNode = node as { asset?: { src?: string } }
      if (itemNode.asset?.src === item.pascalAssetUrl) count += 1
    }
    return count
  })

  const handleSave = async () => {
    setError(null)
    try {
      await updateGLBMeta(item.id, {
        name: name.trim() || item.name,
        category,
        suggestedHADomain: domain,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const handleDelete = async () => {
    setError(null)
    try {
      await deleteGLB(item.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const handleCategoryChange = (next: Category) => {
    setCategory(next)
    setDomain(DEFAULT_DOMAIN_FOR_CATEGORY[next])
  }

  const handleReplaceThumbnail = (file: File) => {
    setError(null)
    replaceThumbnail(item.id, file).catch((err) =>
      setError(err instanceof Error ? err.message : 'Replace thumbnail failed'),
    )
  }

  const handleRegenerate = () => {
    setError(null)
    regenerateThumbnail(item.id).catch((err) =>
      setError(err instanceof Error ? err.message : 'Regenerate failed'),
    )
  }

  const isBuiltin = item.builtin

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex w-96 flex-col gap-3 rounded-md border border-border/50 bg-[#1C1C1E] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-medium text-foreground text-sm">Modifier l'item</h2>

        {isBuiltin && (
          <p className="rounded bg-accent/40 px-2 py-1.5 text-muted-foreground text-xs">
            Cet item est un exemple built-in, il n'est pas modifiable.
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Nom</span>
          <input
            className="rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            disabled={isBuiltin}
            onChange={(e) => setName(e.target.value)}
            type="text"
            value={name}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Catégorie</span>
          <select
            className="rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            disabled={isBuiltin}
            onChange={(e) => handleCategoryChange(e.target.value as Category)}
            value={category}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Domain HA suggéré</span>
          <select
            className="rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground text-sm focus:border-primary focus:outline-none disabled:opacity-60"
            disabled={isBuiltin}
            onChange={(e) => setDomain((e.target.value || null) as HADomainHint)}
            value={domain ?? ''}
          >
            {DOMAIN_OPTIONS.map((o) => (
              <option key={o.value ?? 'null'} value={o.value ?? ''}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {!isBuiltin && (
          <div className="flex gap-2">
            <input
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleReplaceThumbnail(f)
                e.target.value = ''
              }}
              ref={imageInputRef}
              type="file"
            />
            <button
              className="flex-1 rounded-md bg-accent px-3 py-1.5 font-medium text-foreground text-xs hover:bg-accent/70"
              onClick={() => imageInputRef.current?.click()}
              type="button"
            >
              Remplacer thumbnail
            </button>
            <button
              className="flex-1 rounded-md bg-accent px-3 py-1.5 font-medium text-foreground text-xs hover:bg-accent/70"
              onClick={handleRegenerate}
              type="button"
            >
              Re-générer
            </button>
          </div>
        )}

        {error && <span className="text-red-400 text-xs">{error}</span>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {isBuiltin ? (
            <button
              className="rounded-md px-3 py-1.5 text-muted-foreground text-xs disabled:opacity-40"
              disabled
              title="Les items built-in ne peuvent pas être supprimés"
              type="button"
            >
              Supprimer
            </button>
          ) : !confirmDelete ? (
            <button
              className="rounded-md px-3 py-1.5 text-red-400 text-xs hover:bg-red-500/20"
              onClick={() => setConfirmDelete(true)}
              type="button"
            >
              Supprimer
            </button>
          ) : (
            <div className="flex flex-col gap-1">
              {usageCount > 0 && (
                <span className="text-orange-400 text-[11px]">
                  {usageCount} item{usageCount > 1 ? 's' : ''} de la scène utilise{usageCount > 1 ? 'nt' : ''} ce GLB
                </span>
              )}
              <div className="flex gap-2">
                <button
                  className="rounded-md bg-red-500/80 px-3 py-1.5 font-medium text-white text-xs hover:bg-red-500"
                  onClick={handleDelete}
                  type="button"
                >
                  Confirmer
                </button>
                <button
                  className="rounded-md bg-accent px-3 py-1.5 text-foreground text-xs hover:bg-accent/70"
                  onClick={() => setConfirmDelete(false)}
                  type="button"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              className="rounded-md bg-accent px-3 py-1.5 text-foreground text-xs hover:bg-accent/70"
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            {!isBuiltin && (
              <button
                className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs hover:bg-primary/80"
                onClick={handleSave}
                type="button"
              >
                Enregistrer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
