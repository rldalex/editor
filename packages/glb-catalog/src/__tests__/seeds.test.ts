import { describe, expect, test } from 'bun:test'
import { BUILTIN_SEEDS, mergeWithSeeds } from '../storage/seeds'

describe('BUILTIN_SEEDS', () => {
  test('has 3 seeds all marked builtin', () => {
    expect(BUILTIN_SEEDS.length).toBe(3)
    for (const s of BUILTIN_SEEDS) {
      expect(s.builtin).toBe(true)
      expect(s.id).toMatch(/^seed-/)
    }
  })
  test('covers light, cover, furniture categories', () => {
    const cats = BUILTIN_SEEDS.map((s) => s.category)
    expect(cats).toContain('light')
    expect(cats).toContain('cover')
    expect(cats).toContain('furniture')
  })
})

describe('mergeWithSeeds', () => {
  test('prepends builtins before customs', () => {
    const merged = mergeWithSeeds([])
    expect(merged.length).toBe(3)
    expect(merged.every((m) => m.builtin)).toBe(true)
  })
  test('customs appear after builtins', () => {
    const custom = {
      id: 'custom-1',
      builtin: false,
      name: 'Custom',
      category: 'light' as const,
      suggestedHADomain: 'light' as const,
      filename: 'x.glb',
      meshNames: [],
      pascalAssetUrl: 'asset://uuid',
      createdAt: 1,
      updatedAt: 1,
    }
    const merged = mergeWithSeeds([custom], (asset) => `/thumb/${asset.id}.webp`)
    expect(merged.length).toBe(4)
    expect(merged[3].id).toBe('custom-1')
    expect(merged[3].thumbnailUrl).toBe('/thumb/custom-1.webp')
  })
  test('builtin thumbnailUrl is empty (overridden at runtime by useCatalog)', () => {
    const merged = mergeWithSeeds([])
    for (const s of merged) {
      expect(s.thumbnailUrl).toBe('')
    }
  })
})
