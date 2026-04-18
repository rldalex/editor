import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { extractMeshNames } from '../detect/gltf-meshes'

describe('extractMeshNames', () => {
  test('extracts mesh names from GLB fixture', async () => {
    const buf = readFileSync(
      new URL('./fixtures/mini.glb', import.meta.url),
    )
    const blob = new Blob([buf])
    const names = await extractMeshNames(blob)
    expect(names).toContain('light_test')
    expect(names).toContain('glow_part')
  })
  test('returns [] for non-GLB blob', async () => {
    const blob = new Blob(['not a glb'])
    const names = await extractMeshNames(blob)
    expect(names).toEqual([])
  })
})
