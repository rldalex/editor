import { z } from 'zod'

export const SceneBundleAssetSchema = z.object({
  uuid: z.string(),
  path: z.string(),
  name: z.string(),
  category: z.string().optional(),
  sizeBytes: z.number().int().nonnegative(),
  thumbnail: z.string().optional(),
})
export type SceneBundleAsset = z.infer<typeof SceneBundleAssetSchema>

export const SceneBundleManifestSchema = z.object({
  version: z.literal(1),
  format: z.literal('maison3d'),
  createdAt: z.iso.datetime(),
  createdBy: z.object({
    app: z.enum(['editor', 'cli']),
    version: z.string(),
  }),
  scene: z.object({
    nodeCount: z.number().int().nonnegative(),
    rootCount: z.number().int().nonnegative(),
    houseName: z.string().optional(),
  }),
  ha: z.object({
    bindingCount: z.number().int().nonnegative(),
    entities: z.array(z.string()),
  }),
  assets: z.array(SceneBundleAssetSchema),
})
export type SceneBundleManifest = z.infer<typeof SceneBundleManifestSchema>
