import { loadAssetUrl, saveAsset } from '@pascal-app/core'
import { nanoid } from 'nanoid'
import { type CategoryResolver, resolveAssetMeta } from './detect/resolve'
import { extractMeshNames } from './detect/gltf-meshes'
import { revokeThumbUrl } from './hooks/use-catalog'
import { type GLBAsset } from './schema'
import {
  dbDeleteAsset,
  dbGetAsset,
  dbListAssets,
  dbPutAsset,
  dbReplaceThumbnail,
  dbUpdateAsset,
} from './storage/db'
import { renderThumbnail } from './thumbnails/render'
import { resizeImageToThumbnail } from './thumbnails/resize'

export const MAX_GLB_SIZE = 200 * 1024 * 1024 // 200 MB

// --- Peer-dep to @pascal-app/core ---
// This package treats @pascal-app/core as a hard runtime dep (imports above).
// It's intentional: the reason this package exists in our fork is precisely
// to plug into Pascal's asset:// store. Outside the fork, re-implement
// saveAsset/loadAssetUrl equivalents before using.

export interface UploadOptions {
  resolver: CategoryResolver
  onPhase?: (phase: 'preparing' | 'detecting' | 'rendering' | 'storing') => void
}

export async function uploadGLB(file: File, opts: UploadOptions): Promise<GLBAsset> {
  if (file.size > MAX_GLB_SIZE) {
    throw new Error(`File is too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is 200 MB.`)
  }
  if (!/\.(glb|gltf)$/i.test(file.name)) {
    throw new Error('Invalid file type. Only .glb / .gltf accepted.')
  }

  opts.onPhase?.('preparing')
  const meshNames = await extractMeshNames(file)

  opts.onPhase?.('detecting')
  const { category, domain } = resolveAssetMeta(meshNames, file.name, opts.resolver)

  opts.onPhase?.('rendering')
  const thumbBlob = await renderThumbnail(file)

  opts.onPhase?.('storing')
  const pascalAssetUrl = await saveAsset(file)
  const now = Date.now()
  const asset: GLBAsset = {
    id: nanoid(16),
    builtin: false,
    name: file.name.replace(/\.(glb|gltf)$/i, ''),
    category,
    suggestedHADomain: domain,
    filename: file.name,
    meshNames,
    pascalAssetUrl,
    createdAt: now,
    updatedAt: now,
  }
  await dbPutAsset(asset, thumbBlob)
  return asset
}

export async function updateGLBMeta(
  id: string,
  patch: Partial<Pick<GLBAsset, 'name' | 'category' | 'suggestedHADomain'>>,
): Promise<void> {
  const existing = await dbGetAsset(id)
  if (!existing) throw new Error(`Asset ${id} not found`)
  if (existing.builtin) throw new Error('Built-in seeds cannot be edited')
  await dbUpdateAsset(id, patch)
}

export async function replaceThumbnail(id: string, image: File): Promise<void> {
  const existing = await dbGetAsset(id)
  if (!existing) throw new Error(`Asset ${id} not found`)
  if (existing.builtin) throw new Error('Built-in seeds cannot be edited')
  const thumb = await resizeImageToThumbnail(image)
  await dbReplaceThumbnail(id, thumb)
}

export async function regenerateThumbnail(id: string): Promise<void> {
  const existing = await dbGetAsset(id)
  if (!existing) throw new Error(`Asset ${id} not found`)
  if (existing.builtin) throw new Error('Built-in seeds cannot be edited')
  const blobUrl = await loadAssetUrl(existing.pascalAssetUrl)
  if (!blobUrl) throw new Error('Could not load GLB from Pascal store')
  const glbBlob = await fetch(blobUrl).then((r) => r.blob())
  const thumb = await renderThumbnail(glbBlob)
  await dbReplaceThumbnail(id, thumb)
}

export async function deleteGLB(id: string): Promise<void> {
  const existing = await dbGetAsset(id)
  if (!existing) throw new Error(`Asset ${id} not found`)
  if (existing.builtin) throw new Error('Built-in seeds cannot be deleted')
  // Delete blob from Pascal's idb-keyval (key pattern = 'asset_data:<uuid>')
  const uuid = existing.pascalAssetUrl.replace(/^asset:\/\//, '')
  const { del } = await import('idb-keyval')
  await del(`asset_data:${uuid}`)
  await dbDeleteAsset(id)
  revokeThumbUrl(id)
}

export async function listAssets(): Promise<GLBAsset[]> {
  return dbListAssets()
}
