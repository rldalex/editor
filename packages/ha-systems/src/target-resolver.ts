// apps/editor/ha/systems/target-resolver.ts
import { sceneRegistry } from '@pascal-app/core'
import type { AnyNodeId } from '@pascal-app/core'
import type { Mesh, Material } from 'three'

const EMISSIVE_MESH_REGEX = /glow|emissive|_emit$/i

/**
 * Flag placed on a material once we've cloned it away from Pascal's
 * `baseMaterial` / `glassMaterial` singletons and bumped its version to
 * force the NodeMaterial shader to recompile with the emissive branch
 * active. Used to detect when Pascal's `<Clone>` (drei) has silently
 * swapped the material back to the singleton, so the per-frame reapply
 * loop can re-clone.
 */
export const CLONED_FLAG: unique symbol = Symbol('haClonedMaterial')

/**
 * Resolve mutation targets for a mapped node.
 *
 * Returns `null` if the Group is not yet registered (GLB not loaded).
 * Caller should push the binding into the pending queue in that case.
 *
 * Selection strategy:
 *   1. Collect all descendant meshes of the Group.
 *   2. If any match /glow|emissive|_emit$/i, keep only those.
 *   3. Otherwise, fall back to all meshes (the whole item glows).
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

  for (const mesh of targets) {
    ensureCloned(mesh)
  }

  return targets
}

/**
 * Ensure `mesh.material` is our cloned instance, not Pascal's shared
 * singleton. Idempotent: checks the CLONED_FLAG first, only clones if
 * absent. Used both on first resolution and on per-frame reapply to
 * detect when Pascal has swapped the material back.
 */
export function ensureCloned(mesh: Mesh): void {
  const m = mesh.material
  if (Array.isArray(m)) {
    let replaced = false
    const next = m.map((x: Material) => {
      if ((x as any)[CLONED_FLAG]) return x
      const clone = x.clone()
      ;(clone as any)[CLONED_FLAG] = true
      replaced = true
      return clone
    })
    if (replaced) mesh.material = next
  } else if (m) {
    if ((m as any)[CLONED_FLAG]) return
    const clone = (m as Material).clone()
    ;(clone as any)[CLONED_FLAG] = true
    mesh.material = clone
  }
}
