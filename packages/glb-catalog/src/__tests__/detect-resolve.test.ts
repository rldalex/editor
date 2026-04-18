import { describe, expect, test } from 'bun:test'
import { resolveAssetMeta, type CategoryResolver } from '../detect/resolve'

const fakeResolver: CategoryResolver = {
  resolve: (name) => {
    if (name.startsWith('light_')) return { category: 'light', domain: 'light' }
    if (name.startsWith('volet_')) return { category: 'cover', domain: 'cover' }
    return { category: 'uncategorized', domain: null }
  },
}

describe('resolveAssetMeta', () => {
  test('mesh names first, filename ignored when mesh matches', () => {
    const r = resolveAssetMeta(['light_test', 'glow_part'], 'unrelated.glb', fakeResolver)
    expect(r).toEqual({ category: 'light', domain: 'light', matchedFrom: 'mesh' })
  })
  test('filename fallback when no mesh matches', () => {
    const r = resolveAssetMeta(['Cube.001'], 'volet-cuisine.glb', fakeResolver)
    expect(r).toEqual({ category: 'cover', domain: 'cover', matchedFrom: 'filename' })
  })
  test('strips .glb extension from filename', () => {
    const r = resolveAssetMeta([], 'light_suspendu.glb', fakeResolver)
    expect(r.category).toBe('light')
  })
  test('strips .gltf extension too', () => {
    const r = resolveAssetMeta([], 'light_suspendu.gltf', fakeResolver)
    expect(r.category).toBe('light')
  })
  test('uncategorized when nothing matches', () => {
    const r = resolveAssetMeta(['foo'], 'bar.glb', fakeResolver)
    expect(r).toEqual({ category: 'uncategorized', domain: null, matchedFrom: 'none' })
  })
})
