// apps/editor/ha/systems/target-resolver.ts
import { sceneRegistry } from '@pascal-app/core'
import type { AnyNodeId } from '@pascal-app/core'
import type { Mesh, Material } from 'three'

const EMISSIVE_MESH_REGEX = /glow|emissive|_emit$/i

/**
 * Resolve mutation targets for a mapped node.
 *
 * Returns `null` if the Group is not yet registered (GLB not loaded).
 * Caller should push the binding into the pending queue in that case.
 *
 * On success, clones each target mesh's material so that mutations don't
 * bleed into Pascal's global `baseMaterial` / `glassMaterial` singletons
 * (see packages/core/src/materials.ts).
 *
 * Selection strategy:
 *   1. Collect all descendant meshes of the Group.
 *   2. If any match /glow|emissive|_emit$/i, keep only those.
 *   3. Otherwise, fall back to all meshes (the whole item glows).
 *
 * NOTE: If smoke test (Task 1 of the plan) showed that clone() shared
 * emissive Color references across instances, add
 * `mat.emissive = mat.emissive.clone()` after each clone below. The
 * static analysis of Pascal's baseMaterial (no custom emissiveNode)
 * suggests this won't be needed, but validate with the smoke test.
 */
export function resolveTargets(nodeId: AnyNodeId): Mesh[] | null {
  const group = sceneRegistry.nodes.get(nodeId as string)
  if (!group) return null

  const allMeshes: Mesh[] = []
  group.traverse((c) => {
    if ((c as Mesh).isMesh) allMeshes.push(c as Mesh)
  })
  if (allMeshes.length === 0) return null

  const matched = allMeshes.filter((m) => EMISSIVE_MESH_REGEX.test(m.name))
  const targets = matched.length > 0 ? matched : allMeshes

  console.log(
    `[target-resolver] ${nodeId}: ${allMeshes.length} mesh(es) total [${allMeshes.map((m) => m.name || '(unnamed)').join(', ')}], ${matched.length} matched regex, ${targets.length} target(s) after fallback`,
  )

  for (const mesh of targets) {
    const m = mesh.material
    if (Array.isArray(m)) {
      mesh.material = m.map((x: Material) => x.clone())
    } else {
      mesh.material = (m as Material).clone()
    }
  }

  return targets
}
