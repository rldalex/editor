import type { CategoryResolver } from '@maison-3d/glb-catalog'
import { suggestCategoryAndDomain } from '../ha/suggest'

/**
 * Bridge between `@maison-3d/glb-catalog` detection layer and the editor's HA
 * naming convention (defined in `apps/editor/ha/suggest.ts`). The package
 * cannot import the editor directly (workspace cycle), so it accepts a
 * `CategoryResolver` via DI — this is the concrete implementation the editor
 * passes in.
 */
export const haConventionResolver: CategoryResolver = {
  resolve: (name) => suggestCategoryAndDomain(name),
}
