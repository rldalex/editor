'use client'

import { listAssets, type GLBAsset } from '@maison-3d/glb-catalog'
import {
  type BundleAssetInput,
  writeBundle,
} from '@maison-3d/scene-bundle'
import { loadAssetUrl, useScene } from '@pascal-app/core'

/**
 * Collect every unique `asset://<uuid>` reference present in the scene
 * graph. We look at `node.asset.src` — the convention used by Pascal's
 * imported-GLB item nodes.
 */
function collectAssetUuids(nodes: Record<string, unknown>): string[] {
  const set = new Set<string>()
  for (const node of Object.values(nodes)) {
    const asset = (node as { asset?: { src?: unknown } } | null)?.asset
    const src = asset?.src
    if (typeof src === 'string' && src.startsWith('asset://')) {
      set.add(src.slice('asset://'.length))
    }
  }
  return Array.from(set)
}

async function fetchBlobBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`fetch ${url} -> HTTP ${res.status}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Index glb-catalog assets by their `pascalAssetUrl` (i.e. `asset://<uuid>`)
 * so we can resolve metadata (name, category) from a scene reference.
 *
 * Note: the glb-catalog DB is not directly exposed by the package's public
 * API, so we go through `listAssets()` and build the index client-side.
 * This runs once per export — cost is negligible (catalog < 100 items).
 */
async function buildCatalogIndex(): Promise<Map<string, GLBAsset>> {
  const index = new Map<string, GLBAsset>()
  try {
    const assets = await listAssets()
    for (const asset of assets) {
      if (asset.pascalAssetUrl?.startsWith('asset://')) {
        const uuid = asset.pascalAssetUrl.slice('asset://'.length)
        index.set(uuid, asset)
      }
    }
  } catch (err) {
    console.warn('[bundle-export] failed to list catalog assets', err)
  }
  return index
}

/**
 * Serialize the current editor scene (nodes, rootNodeIds) plus all
 * `asset://` GLBs referenced in the scene into a `.maison3d.zip` bundle.
 *
 * Thumbnails are NOT embedded today: the glb-catalog package does not
 * expose an imperative thumbnail-blob getter, and the task constraints
 * forbid touching that package. The manifest schema marks thumbnails as
 * optional, so kiosk consumers can either render on demand or show a
 * placeholder — see D-xxx in DECISIONS.md.
 */
export async function exportSceneBundle(
  houseName: string,
  appVersion: string,
): Promise<Blob> {
  const { nodes, rootNodeIds } = useScene.getState()
  const uuids = collectAssetUuids(nodes)
  const catalogIndex = await buildCatalogIndex()

  const assets: BundleAssetInput[] = []
  for (const uuid of uuids) {
    const url = await loadAssetUrl(`asset://${uuid}`)
    if (!url) {
      console.warn(
        `[bundle-export] asset ${uuid} not found in Pascal IDB — skipped`,
      )
      continue
    }
    let glb: Uint8Array
    try {
      glb = await fetchBlobBytes(url)
    } catch (err) {
      console.warn(`[bundle-export] failed to fetch asset ${uuid}`, err)
      continue
    }
    const catalogEntry = catalogIndex.get(uuid)
    assets.push({
      uuid,
      name: catalogEntry?.name ?? uuid,
      category: catalogEntry?.category,
      glb,
    })
  }

  return writeBundle({
    scene: {
      nodes: nodes as unknown as Record<string, unknown>,
      rootNodeIds: rootNodeIds as unknown as string[],
    },
    assets,
    houseName,
    appVersion,
  })
}

/**
 * Trigger a browser download of a bundle produced by `exportSceneBundle`.
 */
export function downloadBundle(
  blob: Blob,
  filename = `maison_${new Date().toISOString().split('T')[0]}.maison3d.zip`,
): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Defer revoke so the browser has the chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
