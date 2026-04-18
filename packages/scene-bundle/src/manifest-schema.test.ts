import { describe, it, expect } from 'bun:test'
import { SceneBundleManifestSchema } from './manifest-schema'

describe('SceneBundleManifestSchema', () => {
  it('accepts a well-formed manifest', () => {
    const valid = {
      version: 1,
      format: 'maison3d' as const,
      createdAt: '2026-04-18T10:00:00Z',
      createdBy: { app: 'editor' as const, version: '0.1.0' },
      scene: { nodeCount: 42, rootCount: 1, houseName: 'Villa Roppe' },
      ha: { bindingCount: 3, entities: ['light.salon', 'cover.volet_cuisine'] },
      assets: [
        {
          uuid: 'abc-123',
          path: 'assets/abc-123.glb',
          name: 'Lampe salon',
          category: 'light',
          sizeBytes: 54321,
          thumbnail: 'assets/thumbnails/abc-123.webp',
        },
      ],
    }
    expect(SceneBundleManifestSchema.parse(valid)).toEqual(valid)
  })

  it('rejects wrong version', () => {
    expect(() =>
      SceneBundleManifestSchema.parse({ version: 2, format: 'maison3d' }),
    ).toThrow()
  })

  it('rejects wrong format tag', () => {
    expect(() =>
      SceneBundleManifestSchema.parse({ version: 1, format: 'other' }),
    ).toThrow()
  })

  it('allows manifest with zero assets', () => {
    const valid = {
      version: 1,
      format: 'maison3d' as const,
      createdAt: '2026-04-18T10:00:00Z',
      createdBy: { app: 'editor' as const, version: '0.1.0' },
      scene: { nodeCount: 0, rootCount: 0 },
      ha: { bindingCount: 0, entities: [] },
      assets: [],
    }
    expect(() => SceneBundleManifestSchema.parse(valid)).not.toThrow()
  })
})
