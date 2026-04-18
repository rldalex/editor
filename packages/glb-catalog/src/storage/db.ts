import Dexie, { type EntityTable } from 'dexie'
import type { GLBAsset } from '../schema'

interface ThumbnailRow {
  id: string // FK vers GLBAsset.id
  thumb: Blob
}

class CatalogDB extends Dexie {
  assets!: EntityTable<GLBAsset, 'id'>
  thumbnails!: EntityTable<ThumbnailRow, 'id'>

  constructor() {
    super('maison3d-glb-catalog')
    this.version(1).stores({
      assets: 'id, category, createdAt',
      thumbnails: 'id',
    })
  }
}

let _db: CatalogDB | null = null

export function getDB(): CatalogDB {
  if (!_db) _db = new CatalogDB()
  return _db
}

// --- Low-level CRUD ---

export async function dbListAssets(): Promise<GLBAsset[]> {
  return getDB().assets.orderBy('createdAt').toArray()
}

export async function dbGetAsset(id: string): Promise<GLBAsset | undefined> {
  return getDB().assets.get(id)
}

export async function dbPutAsset(asset: GLBAsset, thumb: Blob): Promise<void> {
  const db = getDB()
  await db.transaction('rw', db.assets, db.thumbnails, async () => {
    await db.assets.put(asset)
    await db.thumbnails.put({ id: asset.id, thumb })
  })
}

export async function dbUpdateAsset(
  id: string,
  patch: Partial<GLBAsset>,
): Promise<void> {
  await getDB().assets.update(id, { ...patch, updatedAt: Date.now() })
}

export async function dbReplaceThumbnail(id: string, thumb: Blob): Promise<void> {
  await getDB().thumbnails.put({ id, thumb })
}

export async function dbDeleteAsset(id: string): Promise<void> {
  const db = getDB()
  await db.transaction('rw', db.assets, db.thumbnails, async () => {
    await db.assets.delete(id)
    await db.thumbnails.delete(id)
  })
}

export async function dbGetThumbnail(id: string): Promise<Blob | undefined> {
  const row = await getDB().thumbnails.get(id)
  return row?.thumb
}
