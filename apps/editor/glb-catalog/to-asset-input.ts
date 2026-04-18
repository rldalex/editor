import type { AssetInput } from '@pascal-app/core'
import type { CatalogItem } from '@maison-3d/glb-catalog'

/**
 * Map a `CatalogItem` from our GLB catalog to a Pascal `AssetInput`.
 *
 * The `category` is intentionally hard-coded to `'custom-glb'` (an opaque
 * string, unique to this adapter) to isolate our items from Pascal's built-in
 * Furnish mode categories. The real semantic category lives in `tags[0]`, with
 * the suggested HA domain in `tags[1]` (falling back to `'unknown'`).
 */
export function toAssetInput(item: CatalogItem): AssetInput {
  return {
    id: item.id,
    category: 'custom-glb',
    tags: [item.category, item.suggestedHADomain ?? 'unknown'].filter(Boolean) as string[],
    name: item.name,
    thumbnail: item.thumbnailUrl,
    src: item.pascalAssetUrl,
    scale: [1, 1, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: [1, 1, 1],
  }
}
