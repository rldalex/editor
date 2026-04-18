import { describe, it, expect } from 'bun:test'
import { writeBundle } from './writer'
import { readBundle } from './reader'

describe('readBundle', () => {
  it('reads back what writeBundle produced', async () => {
    const scene = {
      nodes: {
        item_a: { id: 'item_a', type: 'item', parentId: null, visible: true } as any,
      },
      rootNodeIds: ['item_a'],
    }
    const blob = await writeBundle({
      scene,
      assets: [
        {
          uuid: 'u1',
          name: 'Test',
          glb: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
        },
      ],
      houseName: 'Roundtrip',
      haConfigUrl: 'http://ha:8123',
      appVersion: '0.1.0',
    })

    const parsed = await readBundle(blob)
    expect(parsed.manifest.scene.houseName).toBe('Roundtrip')
    expect(parsed.manifest.assets).toHaveLength(1)
    expect(parsed.scene.rootNodeIds).toEqual(['item_a'])
    expect(parsed.haConfig.url).toBe('http://ha:8123')
    expect(parsed.assets.get('u1')?.glb.byteLength).toBe(4)
    expect(parsed.missingAssets).toHaveLength(0)
  })

  it('reports missing assets when scene references asset:// not in zip', async () => {
    const scene = {
      nodes: {
        item_a: {
          id: 'item_a',
          type: 'item',
          parentId: null,
          visible: true,
          asset: { src: 'asset://missing-uuid' },
        } as any,
      },
      rootNodeIds: ['item_a'],
    }
    const blob = await writeBundle({
      scene,
      assets: [],
      appVersion: '0.1.0',
    })
    const parsed = await readBundle(blob)
    expect(parsed.missingAssets).toEqual(['missing-uuid'])
  })

  it('throws on invalid manifest', async () => {
    // bundle avec manifest invalide — fabriqué à la main
    const { zipSync, strToU8 } = await import('fflate')
    const bogus = zipSync({
      'manifest.json': strToU8(JSON.stringify({ version: 2 })),
      'scene.json': strToU8('{}'),
    })
    const blob = new Blob([bogus.buffer as ArrayBuffer], { type: 'application/zip' })
    await expect(readBundle(blob)).rejects.toThrow()
  })
})
