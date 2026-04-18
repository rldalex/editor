import { zipSync, strToU8 } from 'fflate'
import type { SceneBundleManifest } from './manifest-schema'

export type SceneGraphInput = {
  nodes: Record<string, any>
  rootNodeIds: string[]
}

export type BundleAssetInput = {
  uuid: string
  name: string
  category?: string
  glb: Uint8Array
  thumbnail?: Uint8Array // WebP bytes
}

export type WriteBundleOptions = {
  scene: SceneGraphInput
  assets: BundleAssetInput[]
  houseName?: string
  haConfigUrl?: string
  appVersion: string
}

function extractHAEntities(nodes: Record<string, any>): string[] {
  const set = new Set<string>()
  for (const node of Object.values(nodes)) {
    const bindings = node?.metadata?.ha?.bindings as
      | Array<{ entityId?: string }>
      | undefined
    if (!bindings) continue
    for (const b of bindings) {
      if (b.entityId) set.add(b.entityId)
    }
  }
  return Array.from(set).sort()
}

function countBindings(nodes: Record<string, any>): number {
  let n = 0
  for (const node of Object.values(nodes)) {
    const bindings = node?.metadata?.ha?.bindings as unknown[] | undefined
    if (Array.isArray(bindings)) n += bindings.length
  }
  return n
}

export async function writeBundle(
  options: WriteBundleOptions,
): Promise<Blob> {
  const { scene, assets, houseName, haConfigUrl, appVersion } = options

  const manifest: SceneBundleManifest = {
    version: 1,
    format: 'maison3d',
    createdAt: new Date().toISOString(),
    createdBy: { app: 'editor', version: appVersion },
    scene: {
      nodeCount: Object.keys(scene.nodes).length,
      rootCount: scene.rootNodeIds.length,
      houseName,
    },
    ha: {
      bindingCount: countBindings(scene.nodes),
      entities: extractHAEntities(scene.nodes),
    },
    assets: assets.map((a) => ({
      uuid: a.uuid,
      path: `assets/${a.uuid}.glb`,
      name: a.name,
      category: a.category,
      sizeBytes: a.glb.byteLength,
      thumbnail: a.thumbnail ? `assets/thumbnails/${a.uuid}.webp` : undefined,
    })),
  }

  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'scene.json': strToU8(JSON.stringify(scene, null, 2)),
    'ha-config.json': strToU8(
      JSON.stringify({ url: haConfigUrl ?? null }, null, 2),
    ),
  }

  for (const asset of assets) {
    files[`assets/${asset.uuid}.glb`] = asset.glb
    if (asset.thumbnail) {
      files[`assets/thumbnails/${asset.uuid}.webp`] = asset.thumbnail
    }
  }

  const zipped = zipSync(files, { level: 6 })
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
}
