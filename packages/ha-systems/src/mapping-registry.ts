import type { AnyNode, AnyNodeId } from '@pascal-app/core'
import { HA_METADATA_KEY, type HAEntityBinding, type HAMapping } from './schema'

export type MappingMap = Map<AnyNodeId, HAEntityBinding[]>

// Inline reader — mirrors `getHAMapping` from mapping-helpers but avoids
// pulling in @pascal-app/core store (three-mesh-bvh transitive import breaks
// bun test). Pure metadata read, no side effects.
function readMappingFromNode(node: AnyNode): HAMapping | undefined {
  const meta = node.metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined
  const raw = (meta as Record<string, unknown>)[HA_METADATA_KEY]
  if (raw === undefined || raw === null) return undefined
  return raw as HAMapping
}

export function collectHAMappings(
  nodes: Record<AnyNodeId, AnyNode>,
): MappingMap {
  const map: MappingMap = new Map()
  for (const node of Object.values(nodes)) {
    if (node.type !== 'item') continue
    const mapping = readMappingFromNode(node)
    if (!mapping || !Array.isArray(mapping.bindings) || mapping.bindings.length === 0) continue
    map.set(node.id, mapping.bindings)
  }
  return map
}

export type ReconcileCallbacks = {
  onAdd: (nodeId: AnyNodeId, binding: HAEntityBinding) => void
  onRemove: (nodeId: AnyNodeId, binding: HAEntityBinding) => void
  onChange: (nodeId: AnyNodeId, binding: HAEntityBinding) => void
}

const bindingKey = (b: HAEntityBinding) => b.entityId

function bindingsEqual(a: HAEntityBinding, b: HAEntityBinding): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function reconcileMappings(
  prev: MappingMap,
  next: MappingMap,
  cb: ReconcileCallbacks,
): void {
  // 1. Removed nodes entirely
  for (const [nodeId, bindings] of prev) {
    if (!next.has(nodeId)) {
      for (const b of bindings) cb.onRemove(nodeId, b)
    }
  }
  // 2. Added nodes entirely
  for (const [nodeId, bindings] of next) {
    if (!prev.has(nodeId)) {
      for (const b of bindings) cb.onAdd(nodeId, b)
    }
  }
  // 3. Nodes present both sides — diff bindings
  for (const [nodeId, nextBindings] of next) {
    const prevBindings = prev.get(nodeId)
    if (!prevBindings) continue
    const prevByKey = new Map(prevBindings.map((b) => [bindingKey(b), b]))
    const nextByKey = new Map(nextBindings.map((b) => [bindingKey(b), b]))
    for (const [key, nextB] of nextByKey) {
      const prevB = prevByKey.get(key)
      if (!prevB) cb.onAdd(nodeId, nextB)
      else if (!bindingsEqual(prevB, nextB)) cb.onChange(nodeId, nextB)
    }
    for (const [key, prevB] of prevByKey) {
      if (!nextByKey.has(key)) cb.onRemove(nodeId, prevB)
    }
  }
}
