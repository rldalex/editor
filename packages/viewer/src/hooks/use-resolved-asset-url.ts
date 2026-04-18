import { useEffect, useState } from 'react'
import { resolveAssetUrl } from '../lib/asset-url'

/**
 * Resolves any asset.src to a loadable URL:
 * - asset://xxx       → blob URL from IndexedDB (Pascal's saveAsset store)
 * - http(s)://        → as-is
 * - /path or relative → prepended with ASSETS_CDN_URL
 *
 * Returns null while loading or if resolution fails. Mirrors the sync-callable
 * pattern of `useAssetUrl` used by ScanRenderer/GuideRenderer. ItemRenderer
 * needs the extra CDN-prefixing branch (built-in Pascal items ship with
 * /items/<name>.glb paths), hence the wrapper over `resolveAssetUrl` rather
 * than direct `loadAssetUrl`.
 */
export function useResolvedAssetUrl(url: string): string | null {
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResolved(null)
    resolveAssetUrl(url).then(
      (result) => {
        if (!cancelled) setResolved(result)
      },
      (err) => {
        if (!cancelled) {
          console.warn('useResolvedAssetUrl: failed to resolve', url, err)
          setResolved(null)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [url])

  return resolved
}
