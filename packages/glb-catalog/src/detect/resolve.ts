import type { Category, HADomainHint } from '../schema'

export interface CategoryResolver {
  resolve(name: string): { category: Category; domain: HADomainHint }
}

export function resolveAssetMeta(
  meshNames: string[],
  filename: string,
  resolver: CategoryResolver,
): { category: Category; domain: HADomainHint; matchedFrom: 'mesh' | 'filename' | 'none' } {
  for (const mesh of meshNames) {
    const { category, domain } = resolver.resolve(mesh)
    if (category !== 'uncategorized') {
      return { category, domain, matchedFrom: 'mesh' }
    }
  }
  const baseName = filename.replace(/\.(glb|gltf)$/i, '').replace(/-/g, '_')
  const { category, domain } = resolver.resolve(baseName)
  if (category !== 'uncategorized') {
    return { category, domain, matchedFrom: 'filename' }
  }
  return { category: 'uncategorized', domain: null, matchedFrom: 'none' }
}
