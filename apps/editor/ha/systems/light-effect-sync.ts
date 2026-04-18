// apps/editor/ha/systems/light-effect-sync.ts
import { useInteractive, useScene } from '@pascal-app/core'
import type { AnyNodeId, ItemNode } from '@pascal-app/core'

/**
 * Locate the index of the first `toggle` control on an item's asset
 * interactive definition, or -1 if the asset has no such control or no
 * LightEffect to drive. Cached per-node to avoid re-scanning each frame.
 *
 * We only return a valid index when BOTH conditions hold:
 *   - `asset.interactive.controls` contains a `kind: 'toggle'` entry
 *   - `asset.interactive.effects` contains at least one `kind: 'light'`
 * That way, mapping an item without a real Three.js light effect (e.g. a
 * decorative figurine) is a silent no-op — we won't flip a toggle that
 * does nothing visible, and we won't log spurious warnings.
 */
export function findToggleControlIndex(nodeId: AnyNodeId): number {
  const node = useScene.getState().nodes[nodeId] as ItemNode | undefined
  if (!node || node.type !== 'item') return -1
  const interactive = node.asset?.interactive
  if (!interactive) return -1

  const hasLightEffect = interactive.effects?.some((e) => e.kind === 'light')
  if (!hasLightEffect) return -1

  const idx = interactive.controls?.findIndex((c) => c.kind === 'toggle') ?? -1
  return idx
}

/**
 * Sync an HA entity state to the item's Pascal interactive toggle. When
 * the mapped entity is `on`, Pascal's ItemLightPool spins up the light
 * effect defined on the asset (the real Three.js PointLight that
 * illuminates the room). Idempotent: re-calling with the same state is
 * cheap — Zustand's setState is a no-op when the value doesn't change.
 *
 * Called every frame by HAVisualSystem's reapply loop alongside the
 * emissive mutation, so state survives Pascal re-renders the same way.
 */
export function syncLightEffect(nodeId: AnyNodeId, toggleIndex: number, haState: string | undefined): void {
  if (toggleIndex < 0) return
  const isOn = haState === 'on'
  const current = useInteractive.getState().items[nodeId]?.controlValues?.[toggleIndex]
  if (current === isOn) return // avoid triggering renderers on no-op sets
  useInteractive.getState().setControlValue(nodeId, toggleIndex, isOn)
}
