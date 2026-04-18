import { z } from 'zod'

export const Category = z.enum([
  'light',
  'cover',
  'sensor',
  'furniture',
  'uncategorized',
])
export type Category = z.infer<typeof Category>

export const HADomainHint = z.union([
  z.enum(['light', 'switch', 'cover', 'fan', 'climate', 'sensor']),
  z.null(),
])
export type HADomainHint = z.infer<typeof HADomainHint>

export const GLBAsset = z.object({
  id: z.string(),
  builtin: z.boolean(),
  name: z.string(),
  category: Category,
  suggestedHADomain: HADomainHint,
  filename: z.string(),
  meshNames: z.array(z.string()),
  pascalAssetUrl: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type GLBAsset = z.infer<typeof GLBAsset>

export interface CatalogItem extends GLBAsset {
  thumbnailUrl: string
}
