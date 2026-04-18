import type { CatalogItem, GLBAsset } from '../schema'

const SEED_DIR = '/items/catalog-seed'

export const BUILTIN_SEEDS: GLBAsset[] = [
  {
    id: 'seed-light-ceiling',
    builtin: true,
    name: 'Lampe plafond (exemple)',
    category: 'light',
    suggestedHADomain: 'light',
    filename: 'light-ceiling.glb',
    meshNames: ['light_ceiling', 'glow_lampshade'],
    pascalAssetUrl: `${SEED_DIR}/light-ceiling.glb`,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'seed-volet-simple',
    builtin: true,
    name: 'Volet simple (exemple)',
    category: 'cover',
    suggestedHADomain: 'cover',
    filename: 'volet-simple.glb',
    meshNames: ['volet_cadre', 'volet_tablier_emit'],
    pascalAssetUrl: `${SEED_DIR}/volet-simple.glb`,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'seed-prise-simple',
    builtin: true,
    name: 'Prise simple (exemple)',
    category: 'furniture',
    suggestedHADomain: 'switch',
    filename: 'prise-simple.glb',
    meshNames: ['prise_socle', 'prise_led_emit'],
    pascalAssetUrl: `${SEED_DIR}/prise-simple.glb`,
    createdAt: 0,
    updatedAt: 0,
  },
]

/**
 * Merge built-in seeds with user-uploaded customs. Builtins first, then customs
 * in input order. Each item gains a `thumbnailUrl`:
 *   - seed → '' (builtin thumbnails sont générés au runtime via
 *     ensureSeedThumbnails() et injectés par useCatalog en override)
 *   - custom → resolved via `thumbnailUrlForAsset(asset)` (typically a blob URL)
 */
export function mergeWithSeeds(
  customs: GLBAsset[],
  thumbnailUrlForAsset: (asset: GLBAsset) => string = () => '',
): CatalogItem[] {
  const builtins: CatalogItem[] = BUILTIN_SEEDS.map((a) => ({
    ...a,
    thumbnailUrl: '',
  }))
  const custom: CatalogItem[] = customs.map((a) => ({
    ...a,
    thumbnailUrl: thumbnailUrlForAsset(a),
  }))
  return [...builtins, ...custom]
}
