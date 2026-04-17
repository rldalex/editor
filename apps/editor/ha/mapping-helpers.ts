import { type AnyNode, type AnyNodeId, useScene } from '@pascal-app/core'
import { HA_METADATA_KEY, type HAMapping } from './schema'

type NodeMetadata = Record<string, unknown>

function readMetadata(node: AnyNode): NodeMetadata {
  const meta = node.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return meta as NodeMetadata
  }
  return {}
}

/**
 * Read the HA mapping stored on a node's metadata, or `undefined` if absent.
 *
 * Returns the stored value as-is — no runtime validation. Callers rendering
 * the mapping should be tolerant of missing optional fields.
 */
export function getHAMapping(node: AnyNode): HAMapping | undefined {
  const meta = readMetadata(node)
  const raw = meta[HA_METADATA_KEY]
  if (raw === undefined || raw === null) return undefined
  return raw as HAMapping
}

/**
 * Persist an HA mapping onto a node's metadata via the Pascal scene store.
 *
 * Merges into existing metadata so any non-HA keys (catalogItemId, etc.) are
 * preserved. Cast to Pascal's strict JSONType at the boundary — the mapping
 * shape is statically guaranteed to be JSON-serializable.
 */
export function setHAMapping(nodeId: AnyNodeId, mapping: HAMapping): void {
  const scene = useScene.getState()
  const node = scene.nodes[nodeId]
  if (!node) return
  const nextMetadata = {
    ...readMetadata(node),
    [HA_METADATA_KEY]: mapping,
  }
  scene.updateNode(nodeId, { metadata: nextMetadata as AnyNode['metadata'] })
}

/**
 * Strip the HA mapping from a node's metadata, leaving any other metadata intact.
 */
export function removeHAMapping(nodeId: AnyNodeId): void {
  const scene = useScene.getState()
  const node = scene.nodes[nodeId]
  if (!node) return
  const current = readMetadata(node)
  if (!(HA_METADATA_KEY in current)) return
  const { [HA_METADATA_KEY]: _removed, ...rest } = current
  scene.updateNode(nodeId, { metadata: rest as AnyNode['metadata'] })
}

/** Convenience: does this node have at least one HA binding? */
export function hasHAMapping(node: AnyNode): boolean {
  const mapping = getHAMapping(node)
  return !!mapping && Array.isArray(mapping.bindings) && mapping.bindings.length > 0
}
