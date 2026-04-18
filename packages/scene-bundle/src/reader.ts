import { unzipSync, strFromU8 } from 'fflate'
import { SceneBundleManifestSchema, type SceneBundleManifest } from './manifest-schema'

export type ParsedBundle = {
  manifest: SceneBundleManifest
  scene: { nodes: Record<string, any>; rootNodeIds: string[] }
  haConfig: { url: string | null }
  assets: Map<string, { glb: Uint8Array; thumbnail?: Uint8Array }>
  missingAssets: string[] // uuids referenced in scene but absent from zip
}

function extractAssetRefs(nodes: Record<string, any>): string[] {
  const refs = new Set<string>()
  for (const node of Object.values(nodes)) {
    const src = node?.asset?.src as string | undefined
    if (typeof src === 'string' && src.startsWith('asset://')) {
      refs.add(src.slice('asset://'.length))
    }
  }
  return Array.from(refs)
}

export async function readBundle(file: Blob | File): Promise<ParsedBundle> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const entries = unzipSync(buf)

  const manifestRaw = entries['manifest.json']
  if (!manifestRaw) throw new Error('Bundle invalide : manifest.json manquant')

  let manifestJson: unknown
  try {
    manifestJson = JSON.parse(strFromU8(manifestRaw))
  } catch (e) {
    throw new Error(`manifest.json corrompu : ${(e as Error).message}`)
  }
  const manifest = SceneBundleManifestSchema.parse(manifestJson)

  const sceneRaw = entries['scene.json']
  if (!sceneRaw) throw new Error('Bundle invalide : scene.json manquant')
  const scene = JSON.parse(strFromU8(sceneRaw)) as {
    nodes: Record<string, any>
    rootNodeIds: string[]
  }

  const haConfigRaw = entries['ha-config.json']
  const haConfig = haConfigRaw
    ? (JSON.parse(strFromU8(haConfigRaw)) as { url: string | null })
    : { url: null }

  const assets = new Map<string, { glb: Uint8Array; thumbnail?: Uint8Array }>()
  for (const a of manifest.assets) {
    const glb = entries[a.path]
    if (!glb) continue
    const thumb = a.thumbnail ? entries[a.thumbnail] : undefined
    assets.set(a.uuid, { glb, thumbnail: thumb })
  }

  const referenced = extractAssetRefs(scene.nodes)
  const missingAssets = referenced.filter((uuid) => !assets.has(uuid))

  return { manifest, scene, haConfig, assets, missingAssets }
}
