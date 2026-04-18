'use client'

import { type ParsedBundle, readBundle } from '@maison-3d/scene-bundle'
import { saveAsset, useScene } from '@pascal-app/core'

export type LoadBundleResult = {
  nodeCount: number
  rootCount: number
  assetCount: number
  missingAssets: string[]
  houseName?: string
  manifest: ParsedBundle['manifest']
}

/**
 * Rehydrate a scene bundle into the kiosk's local state.
 *
 * Assets are saved into Pascal's IDB via `saveAsset()` directly — we skip
 * `uploadGLB()` from glb-catalog because the kiosk has no catalog UI and
 * doesn't need thumbnails. This also saves ~20ms per asset of WebGL2
 * thumbnail rendering.
 *
 * Because `saveAsset` always generates a fresh uuid, we build an old→new
 * uuid map and patch `scene.nodes[*].asset.src` before pushing into
 * `useScene`. Then `<ItemRenderer>` resolves the new `asset://` via the
 * existing `useResolvedAssetUrl` hook.
 */
export async function loadBundleIntoKiosk(
  file: File | Blob,
): Promise<LoadBundleResult> {
  const parsed = await readBundle(file)

  const uuidMap = new Map<string, string>()
  for (const [oldUuid, { glb }] of parsed.assets) {
    const f = new File([glb as BlobPart], `${oldUuid}.glb`, {
      type: 'model/gltf-binary',
    })
    const newUrl = await saveAsset(f)
    const newUuid = newUrl.slice('asset://'.length)
    if (newUuid !== oldUuid) uuidMap.set(oldUuid, newUuid)
  }

  let nodes = parsed.scene.nodes as Record<string, unknown>
  if (uuidMap.size > 0) {
    const patched: Record<string, unknown> = {}
    for (const [id, node] of Object.entries(nodes)) {
      const src = (node as { asset?: { src?: unknown } })?.asset?.src
      if (typeof src === 'string' && src.startsWith('asset://')) {
        const oldUuid = src.slice('asset://'.length)
        const newUuid = uuidMap.get(oldUuid)
        if (newUuid) {
          patched[id] = {
            ...(node as object),
            asset: {
              ...((node as { asset?: object }).asset ?? {}),
              src: `asset://${newUuid}`,
            },
          }
          continue
        }
      }
      patched[id] = node
    }
    nodes = patched
  }

  // Inject directly into useScene. We skip Pascal's applySceneGraphToEditor
  // because it lives in @pascal-app/editor which kiosk does not depend on
  // (editor-only UI concerns). useScene.setState is the simpler read-only
  // alternative and doesn't trigger editor selection/tool state.
  useScene.setState({
    nodes: nodes as never,
    rootNodeIds: parsed.scene.rootNodeIds as never,
  })

  return {
    nodeCount: Object.keys(nodes).length,
    rootCount: parsed.scene.rootNodeIds.length,
    assetCount: parsed.assets.size,
    missingAssets: parsed.missingAssets,
    houseName: parsed.manifest.scene.houseName,
    manifest: parsed.manifest,
  }
}
