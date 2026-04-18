import { describe, it, expect } from 'bun:test'
import { zipSync, unzipSync, strFromU8 } from 'fflate'
import { writeBundle } from './writer'
import { SceneBundleManifestSchema } from './manifest-schema'

describe('writeBundle', () => {
  it('produces a zip with manifest.json + scene.json + assets/*.glb', async () => {
    const scene = {
      nodes: {
        item_abc: {
          id: 'item_abc',
          type: 'item',
          parentId: null,
          visible: true,
          asset: { src: 'asset://uuid-1' },
          metadata: {
            ha: {
              bindings: [{ entityId: 'light.salon', domain: 'light' }],
            },
          },
        } as any,
      },
      rootNodeIds: ['item_abc'],
    }
    const assets = [
      {
        uuid: 'uuid-1',
        name: 'Lampe',
        category: 'light',
        glb: new Uint8Array([0x67, 0x6c, 0x54, 0x46]), // fake GLB header
      },
    ]
    const blob = await writeBundle({
      scene,
      assets,
      houseName: 'Villa Test',
      haConfigUrl: 'http://ha.local:8123',
      appVersion: '0.1.0',
    })

    const buf = new Uint8Array(await blob.arrayBuffer())
    const entries = unzipSync(buf)

    expect(entries['manifest.json']).toBeDefined()
    expect(entries['scene.json']).toBeDefined()
    expect(entries['ha-config.json']).toBeDefined()
    expect(entries['assets/uuid-1.glb']).toBeDefined()

    const manifest = JSON.parse(strFromU8(entries['manifest.json']))
    expect(() => SceneBundleManifestSchema.parse(manifest)).not.toThrow()
    expect(manifest.scene.houseName).toBe('Villa Test')
    expect(manifest.ha.entities).toEqual(['light.salon'])
    expect(manifest.assets).toHaveLength(1)

    const sceneJson = JSON.parse(strFromU8(entries['scene.json']))
    expect(sceneJson.rootNodeIds).toEqual(['item_abc'])

    const haConfig = JSON.parse(strFromU8(entries['ha-config.json']))
    expect(haConfig.url).toBe('http://ha.local:8123')
    expect(haConfig.token).toBeUndefined()  // jamais de token dans le bundle
  })
})
