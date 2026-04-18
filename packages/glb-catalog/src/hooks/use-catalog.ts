import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import type { CatalogItem, Category, GLBAsset } from '../schema'
import { dbGetThumbnail, getDB } from '../storage/db'
import { ensureSeedThumbnails, mergeWithSeeds } from '../storage/seeds'

// Blob URL cache : keep URLs alive until deleteGLB explicit revoke or session end.
// No ref-counting : < 100 items attendus, ~80 KB × N = négligeable.
const thumbUrlCache = new Map<string, string>()

function getOrCreateThumbUrl(assetId: string, thumb: Blob): string {
  const existing = thumbUrlCache.get(assetId)
  if (existing) return existing
  const url = URL.createObjectURL(thumb)
  thumbUrlCache.set(assetId, url)
  return url
}

export function revokeThumbUrl(assetId: string): void {
  const url = thumbUrlCache.get(assetId)
  if (url) {
    URL.revokeObjectURL(url)
    thumbUrlCache.delete(assetId)
  }
}

export function useCatalog(filter?: { category?: Category }): {
  items: CatalogItem[]
  isLoading: boolean
} {
  const [assets, setAssets] = useState<GLBAsset[]>([])
  const [customThumbs, setCustomThumbs] = useState<Map<string, Blob>>(new Map())
  const [seedThumbUrls, setSeedThumbUrls] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)

  // Hydrate seed thumbnails once at mount
  useEffect(() => {
    void ensureSeedThumbnails().then((map) => setSeedThumbUrls(map))
  }, [])

  // Subscribe custom assets
  useEffect(() => {
    const obs = liveQuery(() => getDB().assets.orderBy('createdAt').toArray())
    const sub = obs.subscribe({
      next: async (list) => {
        setAssets(list)
        const next = new Map<string, Blob>()
        for (const a of list) {
          const t = await dbGetThumbnail(a.id)
          if (t) next.set(a.id, t)
        }
        setCustomThumbs(next)
        setIsLoading(false)
      },
      error: (err) => {
        console.error('useCatalog: liveQuery failed', err)
        setIsLoading(false)
      },
    })
    return () => sub.unsubscribe()
  }, [])

  const items = useMemo(() => {
    const merged = mergeWithSeeds(assets, (asset) => {
      const thumb = customThumbs.get(asset.id)
      return thumb ? getOrCreateThumbUrl(asset.id, thumb) : ''
    })
    // Override builtin thumbnailUrl avec les URLs dynamiques générées
    const withSeedThumbs = merged.map((item) =>
      item.builtin && seedThumbUrls.has(item.id)
        ? { ...item, thumbnailUrl: seedThumbUrls.get(item.id)! }
        : item,
    )
    return filter?.category
      ? withSeedThumbs.filter((i) => i.category === filter.category)
      : withSeedThumbs
  }, [assets, customThumbs, seedThumbUrls, filter?.category])

  return { items, isLoading }
}
