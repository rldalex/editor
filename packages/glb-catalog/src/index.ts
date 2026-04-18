// Schema + types
export type { CatalogItem, Category, GLBAsset, HADomainHint } from './schema'
export { Category as CategorySchema, GLBAsset as GLBAssetSchema, HADomainHint as HADomainHintSchema } from './schema'

// API
export {
  MAX_GLB_SIZE,
  type UploadOptions,
  deleteGLB,
  listAssets,
  regenerateThumbnail,
  replaceThumbnail,
  updateGLBMeta,
  uploadGLB,
} from './api'

// Hook
export { revokeThumbUrl, useCatalog } from './hooks/use-catalog'

// Detection (exposed for adapter bridging)
export type { CategoryResolver } from './detect/resolve'
