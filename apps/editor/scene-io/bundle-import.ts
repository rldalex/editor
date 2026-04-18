'use client'

import { uploadGLB } from '@maison-3d/glb-catalog'
import { readBundle } from '@maison-3d/scene-bundle'
import { useScene } from '@pascal-app/core'
import { applySceneGraphToEditor, type SceneGraph } from '@pascal-app/editor'
import { haConventionResolver } from '../glb-catalog/category-resolver'

type SceneNodes = Record<string, unknown>

/**
 * Walk the scene nodes and remap every `asset://<oldUuid>` found in
 * `node.asset.src` to the new `pascalAssetUrl` produced by rehydrating
 * the blob via `saveAsset()` (via `uploadGLB()` in our case).
 *
 * `saveAsset` always generates a fresh uuid (see `packages/core/src/lib
 * /asset-storage.ts`), so we cannot preserve original ids — we must
 * patch the scene before handing it to `applySceneGraphToEditor()`.
 */
function remapSceneAssetSrcs(
  nodes: SceneNodes,
  uuidMap: Map<string, string>,
): SceneNodes {
  const remapped: SceneNodes = {}
  for (const [id, node] of Object.entries(nodes)) {
    const typed = node as { asset?: { src?: unknown } } | null
    const src = typed?.asset?.src
    if (typeof src === 'string' && src.startsWith('asset://')) {
      const oldUuid = src.slice('asset://'.length)
      const newUrl = uuidMap.get(oldUuid)
      if (newUrl) {
        remapped[id] = {
          ...(node as object),
          asset: { ...(typed?.asset ?? {}), src: newUrl },
        }
        continue
      }
    }
    remapped[id] = node
  }
  return remapped
}

export type BundleImportResult = {
  nodeCount: number
  rootCount: number
  assetsRehydrated: number
  missingAssets: string[]
  houseName?: string
}

/**
 * Rehydrate a `.maison3d.zip` into the editor:
 *  1. Parse the zip (manifest + scene.json + asset blobs).
 *  2. For each asset blob, `uploadGLB()` it — this saves into Pascal's
 *     idb-keyval store (new uuid) AND into the glb-catalog (with a fresh
 *     thumbnail), so the imported GLBs show up in the catalog panel.
 *  3. Remap every `asset://<oldUuid>` reference in `scene.nodes[*]
 *     .asset.src` to the new pascalAssetUrl.
 *  4. `applySceneGraphToEditor(sceneGraph)` to swap the live scene.
 *
 * Missing assets (referenced by the scene but absent from the zip) are
 * surfaced in the returned result and also logged. The scene is applied
 * anyway so the user can still recover the non-asset parts.
 */
export async function importSceneBundle(
  file: Blob | File,
): Promise<BundleImportResult> {
  const parsed = await readBundle(file)

  if (parsed.missingAssets.length > 0) {
    console.warn(
      `[bundle-import] ${parsed.missingAssets.length} asset(s) referenced by scene but absent from bundle:`,
      parsed.missingAssets,
    )
  }

  const uuidMap = new Map<string, string>()
  let rehydrated = 0

  for (const [oldUuid, blob] of parsed.assets) {
    const manifestEntry = parsed.manifest.assets.find((a) => a.uuid === oldUuid)
    const filename = manifestEntry?.name
      ? `${manifestEntry.name}.glb`
      : `${oldUuid}.glb`
    const glbFile = new File([blob.glb as BlobPart], filename, {
      type: 'model/gltf-binary',
    })
    try {
      const asset = await uploadGLB(glbFile, {
        resolver: haConventionResolver,
      })
      uuidMap.set(oldUuid, asset.pascalAssetUrl)
      rehydrated += 1
    } catch (err) {
      console.warn(
        `[bundle-import] failed to rehydrate asset ${oldUuid} (${filename})`,
        err,
      )
    }
  }

  const remappedNodes = remapSceneAssetSrcs(parsed.scene.nodes, uuidMap)

  const sceneGraph: SceneGraph = {
    nodes: remappedNodes,
    rootNodeIds: parsed.scene.rootNodeIds,
  }

  applySceneGraphToEditor(sceneGraph)

  return {
    nodeCount: Object.keys(remappedNodes).length,
    rootCount: parsed.scene.rootNodeIds.length,
    assetsRehydrated: rehydrated,
    missingAssets: parsed.missingAssets,
    houseName: parsed.manifest.scene.houseName,
  }
}

/**
 * Open a native file picker, read the selected `.maison3d.zip` and apply
 * it to the editor. Confirms if the current scene is non-empty. Surfaces
 * parse/IO errors via `alert()`.
 */
export function openBundleImportDialog(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip,.maison3d.zip,application/zip'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    const currentCount = Object.keys(useScene.getState().nodes).length
    if (currentCount > 0) {
      const ok = window.confirm(
        `La scène actuelle contient ${currentCount} nœud(s). Importer va tout remplacer. Continuer ?`,
      )
      if (!ok) return
    }

    try {
      const result = await importSceneBundle(file)
      console.info(
        `[scene-io] bundle importé : ${result.nodeCount} nœud(s), ${result.rootCount} racine(s), ${result.assetsRehydrated} asset(s) rehydraté(s)${
          result.missingAssets.length > 0
            ? `, ${result.missingAssets.length} asset(s) manquant(s)`
            : ''
        }`,
      )
      if (result.missingAssets.length > 0) {
        window.alert(
          `Import terminé, mais ${result.missingAssets.length} asset(s) référencé(s) par la scène étaient absents du bundle. Voir la console pour la liste.`,
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`Import du bundle échoué : ${message}`)
    }
  }
  input.click()
}
